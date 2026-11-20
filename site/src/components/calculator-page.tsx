import * as React from 'react'
import { ArrowLeftIcon, InfoIcon, TrophyIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ArchBadge, OsIcon, ProviderAvatar } from '@/components/runner-bits'
import { HeaderHelp } from '@/components/header-help'
import { MINUTES_PER_MONTH, OS_LABEL, allProviders, allRunners, formatPerMinute, formatUsd, type Runner } from '@/lib/data'

// Cost calculator: everything is computed in the browser from the embedded api.json; inputs live in the
// URL query string only (shareable links), nothing is sent anywhere.
//
//   per-minute runner: monthly = billable minutes × price_usd_per_minute
//                      (billable = minutes, or minutes − free_tier.minutes_per_month when the free tier is applied)
//   flat-fee runner:   monthly = flat fee per month (year / 12) × concurrent jobs
//                      (at least ceil(minutes / 43,200): one concurrent job can run at most 43,200 min in 30 days)
//   effective $/min  = monthly / minutes

type Os = Runner['os']
type Arch = Runner['arch'] | 'any'
type Inputs = { os: Os; arch: Arch; vcpu: number | null; minutes: number; concurrency: number; free: boolean }

const OSES: Os[] = ['linux', 'macos', 'windows']
const ARCHES: Arch[] = ['x64', 'arm64', 'any']
const VCPUS = [2, 4, 8, 16, 32]
const PRESETS = [1_000, 10_000, 50_000, 200_000]
const MAX_MINUTES = 100_000_000
const DEFAULTS: Inputs = { os: 'linux', arch: 'any', vcpu: null, minutes: 10_000, concurrency: 1, free: false }

const providerById = new Map(allProviders.map((p) => [p.id, p]))
const freeTierProviders = allProviders.filter((p) => !p.flat && p.freeMinutes != null)

const toInt = (v: string | null, min: number, max: number) => {
  if (v == null || v.trim() === '') return null
  const n = Math.round(Number(v.replace(/[,_\s]/g, '')))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null
}

function readUrl(): Inputs {
  const q = new URLSearchParams(window.location.search)
  const os = q.get('os') as Os
  const arch = q.get('arch') as Arch
  const vcpu = toInt(q.get('vcpu'), 1, 1024)
  return {
    os: OSES.includes(os) ? os : DEFAULTS.os,
    arch: ARCHES.includes(arch) ? arch : DEFAULTS.arch,
    vcpu: vcpu != null && VCPUS.includes(vcpu) ? vcpu : null,
    minutes: toInt(q.get('minutes'), 0, MAX_MINUTES) ?? DEFAULTS.minutes,
    concurrency: toInt(q.get('concurrency'), 1, 10_000) ?? DEFAULTS.concurrency,
    free: q.get('free') === '1' && freeTierProviders.length > 0,
  }
}

function writeUrl(i: Inputs) {
  const q = new URLSearchParams()
  q.set('os', i.os)
  q.set('arch', i.arch)
  q.set('vcpu', i.vcpu == null ? 'any' : String(i.vcpu))
  q.set('minutes', String(i.minutes))
  q.set('concurrency', String(i.concurrency))
  if (i.free) q.set('free', '1')
  const url = `${window.location.pathname}?${q}${window.location.hash}`
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', url)
}

type Row = {
  r: Runner
  flat: boolean
  monthly: number
  perMinute: number | null
  /** Concurrent jobs billed for a flat-fee runner (may exceed the input when the minutes need more). */
  units: number | null
  freeApplied: number
}

function compute(i: Inputs) {
  const matches = allRunners.filter(
    (r) => r.os === i.os && (i.arch === 'any' || r.arch === i.arch) && (i.vcpu == null || (r.vcpu != null && r.vcpu >= i.vcpu)),
  )
  const rows: Row[] = []
  const needsPrice: Runner[] = []
  const minUnits = Math.max(i.concurrency, Math.ceil(i.minutes / MINUTES_PER_MONTH))
  for (const r of matches) {
    const p = providerById.get(r.provider)!
    if (p.flat) {
      if (r.flatMonthly == null) {
        needsPrice.push(r)
        continue
      }
      const monthly = r.flatMonthly * minUnits
      rows.push({ r, flat: true, monthly, perMinute: i.minutes > 0 ? monthly / i.minutes : null, units: minUnits, freeApplied: 0 })
    } else {
      const free = i.free && p.freeMinutes ? Math.min(p.freeMinutes, i.minutes) : 0
      const monthly = (i.minutes - free) * r.price
      rows.push({ r, flat: false, monthly, perMinute: i.minutes > 0 ? monthly / i.minutes : null, units: null, freeApplied: free })
    }
  }
  rows.sort((a, b) => a.monthly - b.monthly || (b.r.vcpu ?? 0) - (a.r.vcpu ?? 0) || a.r.key.localeCompare(b.r.key))
  needsPrice.sort((a, b) => a.provider.localeCompare(b.provider) || a.arch.localeCompare(b.arch) || (a.vcpu ?? 0) - (b.vcpu ?? 0))
  return { rows, needsPrice, minUnits }
}

// Header explanations for the results table (tooltip on hover, popover from the help icon).
const HEADER_HELP: Record<string, string> = {
  'vCPU / RAM / Disk': 'Virtual CPUs, memory (RAM) in GB and disk (storage) in GB, as published by the provider; values that are not published are left out. With a vCPU filter, runners with at least that many vCPU are listed.',
  Rate: 'What one minute costs at list price, or the flat fee per concurrent job for flat-fee plans. Free-tier minutes are subtracted only when that option is on.',
  'Monthly cost':
    'Per-minute runners: billable minutes × rate. Flat-fee plans: monthly fee × concurrent jobs, at least enough jobs to fit your minutes (43,200 min per job in 30 days). Before per-job rounding, quotas and negotiated discounts.',
  'Effective $/min': 'Monthly cost ÷ your minutes. For flat-fee plans it drops as usage rises.',
  'vs cheapest': 'Extra monthly cost compared with the cheapest option for these inputs, with the ratio in brackets.',
}

const fmtInt = (n: number) => n.toLocaleString('en-US')
const fmtMinutes = (n: number) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}k` : fmtInt(n))

/* ----------------------------------------------------------------------------------------------- inputs */

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">{label}</label>
      ) : (
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      )}
      {children}
      {hint && <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>}
    </div>
  )
}

function NumberInput({ id, value, onChange, min, max, className }: { id: string; value: number; onChange: (n: number) => void; min: number; max: number; className?: string }) {
  // Keep the raw text while typing so the field can be cleared; commit valid numbers immediately.
  const [text, setText] = React.useState(fmtInt(value))
  React.useEffect(() => {
    setText((t) => (toInt(t, min, max) === value ? t : fmtInt(value)))
  }, [value, min, max])
  return (
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const n = toInt(e.target.value, min, max)
        if (n != null) onChange(n)
      }}
      onBlur={() => setText(fmtInt(value))}
      className={cn('h-8 font-mono tabular-nums', className)}
    />
  )
}

function InputsPanel({ i, set }: { i: Inputs; set: (p: Partial<Inputs>) => void }) {
  return (
    <div className="grid gap-x-6 gap-y-4 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 sm:p-5 lg:grid-cols-[auto_auto_auto_1fr_auto]">
      <Field label="OS">
        <ToggleGroup type="single" value={i.os} onValueChange={(v) => v && set({ os: v as Os })} aria-label="OS" className="w-fit">
          {OSES.map((os) => (
            <ToggleGroupItem key={os} value={os} className="gap-1.5">
              <OsIcon os={os} className="size-3.5" />
              {OS_LABEL[os]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field label="Architecture">
        <ToggleGroup type="single" value={i.arch} onValueChange={(v) => v && set({ arch: v as Arch })} aria-label="Architecture" className="w-fit">
          {ARCHES.map((a) => (
            <ToggleGroupItem key={a} value={a} className={cn(a !== 'any' && 'font-mono')}>
              {a === 'any' ? 'Any' : a}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field label="Size (min vCPU)">
        <ToggleGroup
          type="single"
          value={i.vcpu == null ? 'any' : String(i.vcpu)}
          onValueChange={(v) => v && set({ vcpu: v === 'any' ? null : Number(v) })}
          aria-label="Minimum vCPU"
          className="w-fit"
        >
          <ToggleGroupItem value="any">Any</ToggleGroupItem>
          {VCPUS.map((n) => (
            <ToggleGroupItem key={n} value={String(n)} className="font-mono tabular-nums" aria-label={`${n} or more vCPU`}>
              {n}+
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field label="Minutes per month" htmlFor="calc-minutes">
        <div className="flex flex-wrap items-center gap-2">
          <NumberInput id="calc-minutes" value={i.minutes} onChange={(minutes) => set({ minutes })} min={0} max={MAX_MINUTES} className="w-28" />
          <ToggleGroup
            type="single"
            value={PRESETS.includes(i.minutes) ? String(i.minutes) : ''}
            onValueChange={(v) => v && set({ minutes: Number(v) })}
            aria-label="Minute presets"
          >
            {PRESETS.map((n) => (
              <ToggleGroupItem key={n} value={String(n)} className="font-mono tabular-nums" aria-label={`${fmtInt(n)} minutes`}>
                {fmtMinutes(n)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </Field>
      <Field label="Peak concurrent jobs" htmlFor="calc-concurrency">
        <NumberInput id="calc-concurrency" value={i.concurrency} onChange={(concurrency) => set({ concurrency })} min={1} max={10_000} className="w-20" />
      </Field>
      {freeTierProviders.length > 0 && (
        <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground sm:col-span-2 lg:col-span-5">
          <input type="checkbox" checked={i.free} onChange={(e) => set({ free: e.target.checked })} className="mt-0.5 size-3.5 cursor-pointer accent-[var(--brand)]" />
          <span>
            <span className="font-medium text-foreground">Apply free tier</span> where the data lists free minutes per month (
            {freeTierProviders.map((p, n) => (
              <React.Fragment key={p.id}>
                {n > 0 && ', '}
                {p.short}: {fmtInt(p.freeMinutes!)} min
              </React.Fragment>
            ))}
            ). Other providers' trials, plan quotas and credits are never applied.
          </span>
        </label>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------- results */

function Specs({ r }: { r: Runner }) {
  return (
    <span className="font-mono text-[13px] whitespace-nowrap tabular-nums">
      {r.vcpu ?? '–'} <span className="text-muted-foreground">vCPU</span>
      {r.memoryGb != null && (
        <>
          {' · '}
          {r.memoryGb} <span className="text-muted-foreground">GB</span>
        </>
      )}
      {r.diskGb != null && (
        <>
          {' · '}
          {r.diskGb} <span className="text-muted-foreground">GB disk</span>
        </>
      )}
    </span>
  )
}

function BillingTag({ flat }: { flat: boolean }) {
  return flat ? (
    <span className="inline-flex h-[18px] items-center rounded border border-brand/30 bg-brand-soft px-1.5 text-[10.5px] font-medium text-brand-fg">flat fee</span>
  ) : (
    <span className="inline-flex h-[18px] items-center rounded border bg-background px-1.5 text-[10.5px] text-muted-foreground">per minute</span>
  )
}

function Rate({ row, i }: { row: Row; i: Inputs }) {
  if (row.flat) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] whitespace-nowrap">{row.r.flatFee}</span>
        {row.units! > 1 && (
          <span className={cn('text-[11px] whitespace-nowrap', row.units! > i.concurrency ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
            × {fmtInt(row.units!)} concurrent{row.units! > i.concurrency && ' (needed for these minutes)'}
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[13px] whitespace-nowrap tabular-nums">
        {formatPerMinute(row.r.price)}
        <span className="text-[11px] text-muted-foreground">/min</span>
      </span>
      {row.freeApplied > 0 && <span className="text-[11px] whitespace-nowrap text-emerald-700 dark:text-emerald-400">− {fmtInt(row.freeApplied)} free min</span>}
    </div>
  )
}

function Monthly({ row, max }: { row: Row; max: number }) {
  const pct = max > 0 ? Math.max(row.monthly > 0 ? 2 : 0, (row.monthly / max) * 100) : 0
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="font-mono text-[15px] leading-none font-semibold tracking-tight tabular-nums">{formatUsd(row.monthly)}</span>
      <span className="h-1 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className={cn('block h-full rounded-full', row.flat ? 'bg-brand' : 'bg-muted-foreground/45')} style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}

function Delta({ row, cheapest }: { row: Row; cheapest: number }) {
  const d = row.monthly - cheapest
  if (d <= 0.005) {
    return <span className="inline-flex h-5 items-center rounded-full bg-emerald-500/15 px-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">cheapest</span>
  }
  return (
    <span className="font-mono text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
      +{formatUsd(d)}
      {cheapest > 0 && <span className="ml-1 text-[11px]">({(row.monthly / cheapest).toFixed(row.monthly / cheapest < 10 ? 1 : 0)}×)</span>}
    </span>
  )
}

function Headline({ rows, i }: { rows: Row[]; i: Inputs }) {
  const best = rows[0]
  const bestMetered = rows.find((x) => !x.flat)
  const bestFlat = rows.find((x) => x.flat)
  let compare: React.ReactNode = null
  if (best.flat && bestMetered && bestMetered.monthly > best.monthly) {
    compare = (
      <>
        {' '}That is <span className="font-semibold text-foreground">{formatUsd(bestMetered.monthly - best.monthly)} less</span> per month than the cheapest per-minute option, {bestMetered.r.providerShort} <code className="font-mono text-[13px]">{bestMetered.r.id}</code> ({formatUsd(bestMetered.monthly)}).
      </>
    )
  } else if (!best.flat && bestFlat && bestFlat.monthly > best.monthly) {
    const be = bestFlat.monthly / best.r.price
    compare = (
      <>
        {' '}The cheapest flat-fee plan, {bestFlat.r.providerShort} <code className="font-mono text-[13px]">{bestFlat.r.id}</code>, costs {formatUsd(bestFlat.monthly)}
        {!i.free && bestFlat.units === i.concurrency && Number.isFinite(be) && be <= bestFlat.units! * MINUTES_PER_MONTH && <> and would win above about {fmtInt(Math.ceil(be))} min/month</>}.
      </>
    )
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-fg">
        <TrophyIcon className="size-4" />
      </span>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Cheapest for {fmtInt(i.minutes)} min/month: <span className="font-semibold text-foreground">{best.r.providerShort}</span>{' '}
        <code className="font-mono text-[13px] text-foreground">{best.r.id}</code> at{' '}
        <span className="font-semibold text-foreground">{formatUsd(best.monthly)}/month</span>
        {best.perMinute != null && <> (≈ {formatPerMinute(best.perMinute)}/min)</>}.{compare}
      </p>
    </div>
  )
}

function Results({ rows, i }: { rows: Row[]; i: Inputs }) {
  const cheapest = rows[0].monthly
  const max = rows[rows.length - 1].monthly
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              {['#', 'Runner', 'vCPU / RAM / Disk', 'Rate', 'Monthly cost', 'Effective $/min', 'vs cheapest'].map((h, n) => (
                <TableHead key={h} className={cn('h-11 px-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase first:pl-5 last:pr-5', n >= 4 && 'text-right')}>
                  {HEADER_HELP[h] ? (
                    <HeaderHelp help={HEADER_HELP[h]} label={h}>
                      {h}
                    </HeaderHelp>
                  ) : (
                    h
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, n) => (
              <TableRow key={row.r.key} className={cn(n === 0 && 'bg-emerald-500/[0.04]')}>
                <TableCell className="w-10 px-2.5 py-3 pl-5 font-mono text-xs text-muted-foreground tabular-nums">{n + 1}</TableCell>
                <TableCell className="px-2.5 py-3">
                  <div className="flex items-center gap-3">
                    <ProviderAvatar id={row.r.provider} name={row.r.providerName} />
                    <div className="min-w-0">
                      <div className="font-mono text-[13px] font-medium tracking-tight text-foreground">{row.r.id}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {row.r.providerShort}
                        <BillingTag flat={row.flat} />
                        {i.arch === 'any' && <ArchBadge arch={row.r.arch} />}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-2.5 py-3"><Specs r={row.r} /></TableCell>
                <TableCell className="px-2.5 py-3"><Rate row={row} i={i} /></TableCell>
                <TableCell className="px-2.5 py-3 text-right"><Monthly row={row} max={max} /></TableCell>
                <TableCell className="px-2.5 py-3 text-right font-mono text-[13px] tabular-nums">
                  {row.perMinute == null ? <span className="text-muted-foreground/60">–</span> : formatPerMinute(row.perMinute)}
                </TableCell>
                <TableCell className="px-2.5 py-3 pr-5 text-right"><Delta row={row} cheapest={cheapest} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Phone cards */}
      <ol className="flex flex-col gap-2.5 md:hidden">
        {rows.map((row, n) => (
          <li key={row.r.key} className={cn('rounded-xl border bg-card p-3.5 shadow-sm', n === 0 && 'border-emerald-500/40')}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{n + 1}</span>
                <ProviderAvatar id={row.r.provider} name={row.r.providerName} className="size-7" />
                <div className="min-w-0">
                  <div className="truncate font-mono text-[13px] font-medium tracking-tight">{row.r.id}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {row.r.providerShort}
                    <BillingTag flat={row.flat} />
                  </div>
                </div>
              </div>
              <Monthly row={row} max={max} />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pl-7.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <ArchBadge arch={row.r.arch} />
                <Specs r={row.r} />
              </span>
              <span className="font-mono tabular-nums">{row.perMinute == null ? '–' : `${formatPerMinute(row.perMinute)}/min`}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2 pl-7.5">
              <Rate row={row} i={i} />
              <Delta row={row} cheapest={cheapest} />
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

function NeedsAwsPrice({ runners }: { runners: Runner[] }) {
  const byProvider = new Map<string, Runner[]>()
  for (const r of runners) byProvider.set(r.provider, [...(byProvider.get(r.provider) ?? []), r])
  return (
    <section aria-labelledby="needs-price" className="flex flex-col gap-3 rounded-xl border border-dashed bg-muted/30 p-4 sm:p-5">
      <div>
        <h2 id="needs-price" className="text-sm font-semibold tracking-tight text-muted-foreground">Needs your AWS price</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          These runners have no fixed fee in the data: they run in your own cloud account, so the cost depends on your AWS prices. Not ranked.
        </p>
      </div>
      {[...byProvider].map(([id, rs]) => {
        const p = providerById.get(id)!
        return (
          <div key={id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <ProviderAvatar id={id} name={p.name} className="size-6 rounded-md opacity-80" />
              <span className="text-sm font-medium text-muted-foreground">{p.name}</span>
              <span className="text-xs text-muted-foreground">· {rs[0].flatFee}</span>
            </div>
            {rs[0].flatFeeNotes && <p className="text-xs leading-relaxed text-muted-foreground">{rs[0].flatFeeNotes}</p>}
            <ul className="flex flex-wrap gap-1.5">
              {rs.map((r) => (
                <li key={r.key} className="inline-flex items-center gap-1.5 rounded-md border bg-background/60 px-2 py-1 text-xs text-muted-foreground" title={r.notes ?? undefined}>
                  <span className="font-mono text-foreground/80">{r.id}</span>
                  <span className="font-mono tabular-nums">{r.vcpu ?? '–'} vCPU</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

/* ------------------------------------------------------------------------------------------------- page */

export function CalculatorPage() {
  const [inputs, setInputs] = React.useState<Inputs>(readUrl)
  const set = React.useCallback((p: Partial<Inputs>) => setInputs((i) => ({ ...i, ...p })), [])
  React.useEffect(() => writeUrl(inputs), [inputs])

  const { rows, needsPrice } = React.useMemo(() => compute(inputs), [inputs])

  return (
    <>
      <div className="flex flex-col gap-2">
        <a href="../" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-3.5" />
          Per-minute prices
        </a>
        <h1 className="text-xl font-semibold tracking-tight">Cost calculator</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Estimate a month of CI on every provider, per-minute and flat-fee plans side by side. It runs entirely in your
          browser: the inputs only end up in this page's URL, so you can share the link.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <InputsPanel i={inputs} set={set} />

        {rows.length > 0 ? (
          <>
            <Headline rows={rows} i={inputs} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span aria-live="polite" className="tabular-nums">
                {rows.length} {rows.length === 1 ? 'runner' : 'runners'} ranked by monthly cost
              </span>
            </div>
            <Results rows={rows} i={inputs} />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center shadow-sm">
            <p className="text-sm font-medium">No runner with a known price matches these filters</p>
            <p className="max-w-md text-xs text-muted-foreground">
              No {OS_LABEL[inputs.os]} {inputs.arch === 'any' ? '' : `${inputs.arch} `}runner
              {inputs.vcpu != null && ` with ${inputs.vcpu}+ vCPU`} has a per-minute price or fixed fee in the dataset. Try a smaller size or another architecture.
            </p>
            <Button variant="outline" size="sm" onClick={() => set({ arch: 'any', vcpu: null })}>
              <XIcon />
              Any arch and size
            </Button>
          </div>
        )}

        {needsPrice.length > 0 && <NeedsAwsPrice runners={needsPrice} />}

        <div className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
          <div className="space-y-1">
            <p>
              Per-minute: minutes × list price per minute (runners that count each minute as several billed minutes already have that in their price). Flat fee: monthly fee × concurrent
              jobs, with at least one job per {fmtInt(MINUTES_PER_MONTH)} minutes (30 days of one job running nonstop); yearly fees are divided by 12.
              Effective $/min = monthly cost ÷ minutes.
            </p>
            <p>
              Not included: per-job rounding, optional discounts such as Blacksmith's flex scheduling, plan quotas, trials, annual or
              non-profit discounts, storage and network. Per-minute costs don't depend on concurrency, but providers cap it by plan.
              Confirm prices at each provider's source before relying on them.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
