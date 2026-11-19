import { ArrowLeftIcon, ExternalLinkIcon } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArchBadge, LabelChip, OsBadge, ProviderAvatar } from '@/components/runner-bits'
import { flatProviders, formatDate, type Runner } from '@/lib/data'

// Providers billed by a flat fee or license (billing.unit "flat"). They have no per-minute price, so
// they are listed here, one table per provider, instead of in the main per-minute table.

const Dash = () => <span className="text-muted-foreground/60">–</span>

function Specs({ r }: { r: Runner }) {
  if (r.vcpu == null && r.memoryGb == null) return <Dash />
  return (
    <span className="font-mono text-[13px] whitespace-nowrap tabular-nums">
      {r.vcpu ?? '–'} <span className="text-muted-foreground">vCPU</span>
      {r.memoryGb != null && (
        <>
          {' · '}
          {r.memoryGb} <span className="text-muted-foreground">GB</span>
        </>
      )}
    </span>
  )
}

function Fee({ r }: { r: Runner }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] font-semibold tracking-tight whitespace-nowrap text-foreground">{r.flatFee}</span>
      {r.flatFeeNotes && <span className="text-[11px] leading-snug text-muted-foreground">{r.flatFeeNotes}</span>}
    </div>
  )
}

function Source({ r }: { r: Runner }) {
  return (
    <a href={r.source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground hover:text-foreground">
      Verified {formatDate(r.asOf)}
      <ExternalLinkIcon className="size-3" />
    </a>
  )
}

function ProviderSection({ p }: { p: (typeof flatProviders)[number] }) {
  return (
    <section aria-labelledby={`p-${p.id}`} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex items-center gap-3">
          <ProviderAvatar id={p.id} name={p.name} className="size-9" />
          <div>
            <h2 id={`p-${p.id}`} className="text-base font-semibold tracking-tight">{p.name}</h2>
            <div className="text-xs text-muted-foreground">
              {p.runners.length} runners ·{' '}
              <a href={p.pricingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                pricing page
                <ExternalLinkIcon className="size-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
      {p.billingNotes && <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">{p.billingNotes}</p>}
      {p.freeTierNotes && <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">Free tier / trial:</span> {p.freeTierNotes}</p>}

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              {['Runner', 'runs-on labels', 'OS / arch', 'vCPU / RAM', 'Fee', 'Notes'].map((h) => (
                <TableHead key={h} className="h-11 px-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase first:pl-5 last:pr-5">
                  {h === 'runs-on labels' ? (
                    <>
                      <code className="normal-case">runs-on</code> labels
                    </>
                  ) : (
                    h
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.runners.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="px-2.5 py-3 pl-5 align-top">
                  <div className="font-mono text-[13px] font-medium tracking-tight text-foreground">{r.id}</div>
                  {r.osVersion && <div className="text-xs text-muted-foreground">{r.osVersion}</div>}
                  <div className="mt-1.5"><Source r={r} /></div>
                </TableCell>
                <TableCell className="px-2.5 py-3 align-top">
                  <div className="flex flex-col items-start gap-1">
                    {r.labels.map((l) => (
                      <LabelChip key={l} label={l} />
                    ))}
                  </div>
                </TableCell>
                <TableCell className="px-2.5 py-3 align-top">
                  <div className="flex items-center gap-2">
                    <OsBadge os={r.os} />
                    <ArchBadge arch={r.arch} />
                  </div>
                </TableCell>
                <TableCell className="px-2.5 py-3 align-top"><Specs r={r} /></TableCell>
                <TableCell className="w-[240px] min-w-[210px] px-2.5 py-3 align-top whitespace-normal"><Fee r={r} /></TableCell>
                <TableCell className="min-w-[200px] max-w-[280px] px-2.5 py-3 pr-5 align-top whitespace-normal">
                  {r.notes ? <p className="line-clamp-3 text-xs leading-snug text-muted-foreground" title={r.notes}>{r.notes}</p> : <Dash />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Phone cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {p.runners.map((r) => (
          <li key={r.key} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-mono text-[13px] font-medium tracking-tight">{r.id}</div>
                {r.osVersion && <div className="text-xs text-muted-foreground">{r.osVersion}</div>}
              </div>
              <span className="shrink-0 text-right text-[13px] font-semibold tracking-tight">{r.flatFee}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm">
              <OsBadge os={r.os} />
              <ArchBadge arch={r.arch} />
              <Specs r={r} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {r.labels.map((l) => (
                <LabelChip key={l} label={l} className="h-auto min-h-6 py-0.5 text-left whitespace-normal [overflow-wrap:anywhere]" />
              ))}
            </div>
            {(r.flatFeeNotes || r.notes) && (
              <div className="mt-3 space-y-1 text-xs leading-snug text-muted-foreground">
                {r.flatFeeNotes && <p>{r.flatFeeNotes}</p>}
                {r.notes && <p className="line-clamp-3">{r.notes}</p>}
              </div>
            )}
            <div className="mt-3 flex justify-end border-t pt-3">
              <Source r={r} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function FlatFeePage() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <a href="../" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-3.5" />
          Per-minute prices
        </a>
        <h1 className="text-xl font-semibold tracking-tight">Flat-fee &amp; license plans</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          These providers don't bill per runtime minute: you pay a monthly subscription per concurrent job or a license
          (plus, where noted, your own cloud bill). That isn't directly comparable with per-minute prices, so they are
          listed here instead of in the main table. All of them are also in <a href="../api.json" className="font-mono text-[13px] text-foreground underline underline-offset-4">api.json</a>.
        </p>
      </div>
      <div className="mt-8 flex flex-col gap-12">
        {flatProviders.map((p) => (
          <ProviderSection key={p.id} p={p} />
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Fees as listed on each provider's pricing page, before discounts. Click a label to copy it; confirm at the source before relying on them.
      </p>
    </>
  )
}
