import { toast } from 'sonner'
import type { ReactNode } from 'react'
import { CheckIcon } from 'lucide-react'
import { BlacksmithIcon, CirrusIcon, DepotIcon, GitHubIcon, NamespaceIcon, WarpBuildIcon, runsOnIconUrl, ubicloudIconUrl } from '@/components/icons'
import { cn } from '@/lib/utils'
import { OS_LABEL, formatPrice, maxPrice, type Runner, type Unit } from '@/lib/data'

// Official marks for known providers (see NOTICE); colored initials for anything else.
const AVATAR_BASE = 'inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg shadow-sm ring-1 ring-inset'

// White tile in light theme, near-black in dark (as for GitHub) for marks that have light/dark variants.
const NEUTRAL = 'bg-white ring-black/10 dark:bg-neutral-950 dark:ring-white/15'

const PROVIDER_ICON: Record<string, { className: string; icon: ReactNode }> = {
  github: { className: cn(NEUTRAL, 'text-[#181717] dark:text-white'), icon: <GitHubIcon className="size-[62%]" /> },
  blacksmith: { className: 'bg-[#F0FB29] ring-black/10 dark:ring-white/10', icon: <BlacksmithIcon className="size-full" /> },
  depot: { className: NEUTRAL, icon: <DepotIcon className="size-[58%]" /> },
  namespace: { className: NEUTRAL, icon: <NamespaceIcon className="size-[78%]" /> },
  ubicloud: { className: 'bg-[#FF5C12] ring-black/10 dark:ring-white/10', icon: <img src={ubicloudIconUrl} alt="" className="size-full" /> },
  warpbuild: { className: NEUTRAL, icon: <WarpBuildIcon className="size-[84%]" /> },
  'runs-on': { className: 'bg-[#101010] ring-black/10 dark:ring-white/15', icon: <img src={runsOnIconUrl} alt="" className="size-full" /> },
  'cirrus-runners': { className: cn(NEUTRAL, 'text-[#181717] dark:text-white'), icon: <CirrusIcon className="size-[62%]" /> },
}

const FALLBACK = [
  'bg-gradient-to-br from-sky-400 to-blue-600 text-white',
  'bg-gradient-to-br from-fuchsia-400 to-purple-600 text-white',
  'bg-gradient-to-br from-rose-400 to-red-600 text-white',
  'bg-gradient-to-br from-lime-400 to-green-600 text-white',
]

function fallbackStyle(id: string, name: string) {
  const h = [...id].reduce((a, c) => a + c.charCodeAt(0), 0)
  const words = name.split(/[\s-]+/).filter(Boolean)
  const initials = words.length ? words[0][0] + (words[1]?.[0] ?? words[0][1] ?? '') : id.slice(0, 2)
  return { initials: initials.toUpperCase(), className: FALLBACK[h % FALLBACK.length] }
}

export function ProviderAvatar({ id, name, className }: { id: string; name: string; className?: string }) {
  const known = PROVIDER_ICON[id]
  if (known) {
    return (
      <span aria-hidden="true" className={cn(AVATAR_BASE, known.className, className)}>
        {known.icon}
      </span>
    )
  }
  const s = fallbackStyle(id, name)
  return (
    <span aria-hidden="true" className={cn(AVATAR_BASE, 'text-[11px] font-semibold tracking-tight ring-black/10', s.className, className)}>
      {s.initials}
    </span>
  )
}

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText && window.isSecureContext) return navigator.clipboard.writeText(text)
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (ok) resolve()
    else reject(new Error('copy failed'))
  })
}

export function copyLabel(label: string) {
  copyText(label).then(
    () => toast.success('Copied to clipboard', { description: <code className="font-mono">runs-on: {label}</code> }),
    () => toast.error('Could not copy', { description: label }),
  )
}

export function LabelChip({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => copyLabel(label)}
      title={`Copy ${label}`}
      className="inline-flex h-6 cursor-copy items-center whitespace-nowrap rounded-md border bg-muted/60 px-2 font-mono text-[11.5px] text-foreground/90 transition-colors hover:border-brand/50 hover:bg-brand-soft hover:text-brand-fg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {label}
    </button>
  )
}

const OS_DOT: Record<Runner['os'], string> = {
  linux: 'bg-amber-500',
  windows: 'bg-sky-500',
  macos: 'bg-neutral-400 dark:bg-neutral-300',
}

export function OsBadge({ os }: { os: Runner['os'] }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={cn('size-1.5 rounded-full', OS_DOT[os])} aria-hidden="true" />
      {OS_LABEL[os]}
    </span>
  )
}

export function ArchBadge({ arch }: { arch: Runner['arch'] }) {
  return (
    <span className="inline-flex h-5 items-center rounded border bg-background px-1.5 font-mono text-[11px] text-muted-foreground">{arch}</span>
  )
}

export function PublicFree({ free }: { free: boolean }) {
  return free ? (
    <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" title="Free on public repositories">
      <CheckIcon className="size-3.5" strokeWidth={3} />
      <span className="sr-only">Yes</span>
    </span>
  ) : (
    <span className="text-muted-foreground/60" title="Billed on public repositories">
      –<span className="sr-only">No</span>
    </span>
  )
}

export function Price({ value, unit, flatFee = null, align = 'right' }: { value: number; unit: Unit; flatFee?: string | null; align?: 'right' | 'left' }) {
  const other: Unit = unit === 'min' ? 'h' : 'min'
  if (flatFee) {
    // Flat fee / license (billing.unit "flat"): not a per-minute price, so no bar and no "Free".
    return (
      <div className={cn('flex flex-col gap-1', align === 'right' ? 'items-end' : 'items-start')} title="Flat fee or license, not billed per minute">
        <div className="leading-none">
          <span className="text-[13px] font-semibold tracking-tight text-foreground">Flat fee</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{flatFee}</span>
      </div>
    )
  }
  // sqrt scale so cheap runners still get a visible bar
  const pct = value === 0 ? 0 : Math.max(4, Math.sqrt(value / maxPrice) * 100)
  return (
    <div className={cn('flex flex-col gap-1', align === 'right' ? 'items-end' : 'items-start')}>
      <div className="font-mono tabular-nums leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">{value === 0 ? 'Free' : formatPrice(value, unit)}</span>
        {value !== 0 && <span className="ml-0.5 text-[11px] text-muted-foreground">/{unit}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {value === 0 ? 'platform fee' : `${formatPrice(value, other)}/${other}`}
        </span>
      </div>
      <span className="h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className="block h-full rounded-full bg-gradient-to-r from-brand/60 to-brand" style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}
