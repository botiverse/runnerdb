import api from '@api'

type ApiRunner = {
  id: string
  labels: string[]
  os: 'linux' | 'windows' | 'macos'
  os_version?: string
  arch: 'x64' | 'arm64'
  vcpu: number | null
  memory_gb?: number
  disk_gb?: number
  gpu?: { model: string; count: number; memory_gb?: number }
  price_usd_per_minute: number
  flat_fee?: { summary: string; amount_usd?: number; period?: 'month' | 'year'; notes?: string }
  multiplier?: number
  public_repo_free: boolean
  scheduling_discounts?: Record<string, number>
  source_url: string
  specs_url?: string
  verified_as_of: string
  notes?: string
  as_of: string
}
type ApiProvider = {
  id: string
  name: string
  homepage: string
  pricing_url: string
  billing: { unit: string; rounding: string; base_rate_usd?: number; notes?: string }
  public_repo_policy: string
  free_tier?: { notes: string; minutes_per_month?: number }
  notes?: string
  as_of: string | null
  runners: Record<string, ApiRunner>
}
type Api = { as_of: string; providers: Record<string, ApiProvider> }

export type Runner = {
  key: string
  provider: string
  providerName: string
  providerShort: string
  id: string
  labels: string[]
  os: ApiRunner['os']
  osVersion: string | null
  arch: ApiRunner['arch']
  vcpu: number | null
  memoryGb: number | null
  diskGb: number | null
  price: number
  /** Short text for flat-fee/license runners (billing.unit "flat"); null for metered runners. */
  flatFee: string | null
  flatFeeNotes: string | null
  /** Fixed flat fee normalized to USD per month (amount_usd, year / 12); null when the data has no fixed amount. */
  flatMonthly: number | null
  multiplier: number | null
  flex: number | null
  publicFree: boolean
  asOf: string
  source: string
  notes: string | null
  rounding: string
}

const data = api as unknown as Api

export const asOf = data.as_of

// The main table lists metered (per-minute/per-second) providers only. Providers billed by a flat fee or
// license (billing.unit "flat") are not directly comparable and get their own page (flat-fee/).
// api.json itself stays complete.
const isFlat = (p: ApiProvider) => p.billing.unit === 'flat'
const shortName = (name: string) => name.replace(/\s+runners$/i, '')

const toRunners = (p: ApiProvider): Runner[] =>
  Object.values(p.runners).map((r) => ({
    key: `${p.id}/${r.id}`,
    provider: p.id,
    providerName: p.name,
    providerShort: shortName(p.name),
    id: r.id,
    labels: r.labels,
    os: r.os,
    osVersion: r.os_version ?? null,
    arch: r.arch,
    vcpu: r.vcpu,
    memoryGb: r.memory_gb ?? null,
    diskGb: r.disk_gb ?? null,
    price: r.price_usd_per_minute,
    flatFee: r.flat_fee?.summary ?? null,
    flatFeeNotes: r.flat_fee?.notes ?? null,
    flatMonthly: r.flat_fee?.amount_usd == null ? null : r.flat_fee.period === 'year' ? r.flat_fee.amount_usd / 12 : r.flat_fee.amount_usd,
    multiplier: r.multiplier ?? null,
    flex: r.scheduling_discounts?.flex ?? null,
    publicFree: r.public_repo_free,
    asOf: r.as_of,
    source: r.source_url,
    notes: r.notes ?? null,
    rounding: p.billing.rounding,
  }))

const metered = Object.values(data.providers).filter((p) => !isFlat(p))

export const providers = metered.map((p) => ({ id: p.id, name: p.name, short: shortName(p.name), homepage: p.homepage }))
export const runners: Runner[] = metered.flatMap(toRunners)

export const flatProviders = Object.values(data.providers)
  .filter(isFlat)
  .map((p) => ({
    id: p.id,
    name: p.name,
    short: shortName(p.name),
    homepage: p.homepage,
    pricingUrl: p.pricing_url,
    billingNotes: p.billing.notes ?? null,
    freeTierNotes: p.free_tier?.notes ?? null,
    notes: p.notes ?? null,
    runners: toRunners(p).sort((a, b) => a.os.localeCompare(b.os) || a.arch.localeCompare(b.arch) || (a.vcpu ?? 0) - (b.vcpu ?? 0)),
  }))

// Every runner of every provider, metered and flat (used by the cost calculator).
export const allProviders = Object.values(data.providers).map((p) => ({
  id: p.id,
  name: p.name,
  short: shortName(p.name),
  flat: isFlat(p),
  billingNotes: p.billing.notes ?? null,
  /** free_tier.minutes_per_month, informational in the dataset; the calculator applies it only on request. */
  freeMinutes: p.free_tier?.minutes_per_month ?? null,
  freeTierNotes: p.free_tier?.notes ?? null,
}))
export const allRunners: Runner[] = Object.values(data.providers).flatMap(toRunners)

/** Minutes in a 30-day month: the most one concurrent job can run. */
export const MINUTES_PER_MONTH = 43_200

export const OS_LABEL: Record<Runner['os'], string> = { linux: 'Linux', windows: 'Windows', macos: 'macOS' }

export const labelCount = runners.reduce((n, r) => n + r.labels.length, 0)
export const maxPrice = Math.max(...runners.map((r) => r.price))

export type Unit = 'min' | 'h'
export function formatPrice(perMinute: number, unit: Unit): string {
  if (perMinute === 0) return '$0'
  if (unit === 'min') return '$' + +perMinute.toFixed(4)
  const h = perMinute * 60
  return '$' + (h < 0.1 ? String(+h.toFixed(3)) : h.toFixed(2))
}

export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function formatUsd(v: number): string {
  if (v === 0) return '$0'
  if (v < 1) return '$' + v.toFixed(2)
  if (v < 100) return '$' + (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return '$' + Math.round(v).toLocaleString('en-US')
}

/** USD per minute with enough digits to tell cheap runners apart. */
export function formatPerMinute(v: number): string {
  if (v === 0) return '$0'
  if (v >= 0.01) return '$' + +v.toFixed(4)
  return '$' + +v.toPrecision(3)
}

/**
 * Cheapest per-minute runner comparable to `r`: same OS and arch, at least r's vCPU (both known), price > 0.
 * Used for the break-even line on the flat-fee page.
 */
export function cheapestComparable(r: Runner): Runner | null {
  if (r.vcpu == null) return null
  let best: Runner | null = null
  for (const m of runners) {
    if (m.os !== r.os || m.arch !== r.arch || m.vcpu == null || m.vcpu < r.vcpu || m.price <= 0) continue
    if (!best || m.price < best.price) best = m
  }
  return best
}
