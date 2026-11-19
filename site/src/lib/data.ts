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
  multiplier?: number
  public_repo_free: boolean
  scheduling_discounts?: Record<string, number>
  source_url: string
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
  price: number
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
export const providers = Object.values(data.providers).map((p) => ({
  id: p.id,
  name: p.name,
  short: p.name.replace(/\s+runners$/i, ''),
  homepage: p.homepage,
}))

export const runners: Runner[] = Object.values(data.providers).flatMap((p) =>
  Object.values(p.runners).map((r) => ({
    key: `${p.id}/${r.id}`,
    provider: p.id,
    providerName: p.name,
    providerShort: p.name.replace(/\s+runners$/i, ''),
    id: r.id,
    labels: r.labels,
    os: r.os,
    osVersion: r.os_version ?? null,
    arch: r.arch,
    vcpu: r.vcpu,
    memoryGb: r.memory_gb ?? null,
    price: r.price_usd_per_minute,
    multiplier: r.multiplier ?? null,
    flex: r.scheduling_discounts?.flex ?? null,
    publicFree: r.public_repo_free,
    asOf: r.as_of,
    source: r.source_url,
    notes: r.notes ?? null,
    rounding: p.billing.rounding,
  })),
)

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
