import type { ColumnDef, FilterFn } from '@tanstack/react-table'
import { ExternalLinkIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDate, formatPrice, type Runner, type Unit } from '@/lib/data'
import { DataTableColumnHeader } from './column-header'
import { HeaderHelp } from '@/components/header-help'
import { ArchBadge, LabelChip, OsBadge, Price, ProviderAvatar, PublicFree } from '@/components/runner-bits'

export const inSet: FilterFn<Runner> = (row, id, value: string[]) => value.includes(String(row.getValue(id)))

const Dash = () => <span className="text-muted-foreground/60">–</span>

// Header explanations (tooltip on hover, popover from the help icon). Keep in line with README.md's field reference.
const HELP = {
  runner: "Provider and runnerdb's ID for this runner: one machine size, OS and architecture.",
  labels: (
    <>
      Exact labels to put in a workflow's <code className="font-mono">runs-on</code> to get this runner. <code className="font-mono">*</code> matches one or
      more characters. Click a label to copy it.
    </>
  ),
  os: 'Operating system of the runner image: Linux, Windows or macOS.',
  arch: 'CPU architecture: x64 (Intel/AMD) or arm64.',
  vcpu: 'Number of virtual CPUs. – means the provider has not published a verified count.',
  memory: 'Memory (RAM) in GB, as published by the provider. – means not published.',
  disk: 'Disk (storage) in GB, as published by the provider. – means not published.',
  multiplier: "Billing multiplier: the provider charges one base rate per minute and bigger runners count as several minutes. Billed minutes = runtime minutes × multiplier (e.g. Blacksmith 4 vCPU = 4×, so 1 minute costs 4 × $0.002). The Price column already includes it.",
  flex: (
    <>
      Price factor for appending <code className="font-mono">;scheduling=flex</code> to the <code className="font-mono">runs-on</code> label (Blacksmith):
      0.6× bills 60% of the list price.
    </>
  ),
  publicFree: 'Free for public repositories: jobs from public repos are not billed.',
  asOf: "Date this price was last checked against the provider's source. Click it to open the source.",
}

const priceHelp = (unit: Unit) =>
  `List price in USD per runtime ${unit === 'h' ? 'hour (per-minute price × 60)' : 'minute'}, before plan quotas, discounts and per-job rounding.`

export function makeColumns(unit: Unit): ColumnDef<Runner>[] {
  return [
    {
      id: 'provider',
      accessorKey: 'provider',
      filterFn: inSet,
      enableHiding: false,
      enableSorting: false,
    },
    {
      id: 'runner',
      accessorFn: (r) => `${r.providerShort} ${r.id}`,
      meta: { title: 'Runner' },
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Runner" help={HELP.runner} />,
      cell: ({ row: { original: r } }) => (
        <div className="flex items-center gap-3">
          <ProviderAvatar id={r.provider} name={r.providerName} />
          <div className="min-w-0">
            <div className="font-mono text-[13px] font-medium tracking-tight text-foreground">{r.id}</div>
            <div className="text-xs text-muted-foreground">{r.providerShort}</div>
          </div>
        </div>
      ),
    },
    {
      id: 'labels',
      accessorFn: (r) => r.labels.join(' '),
      meta: { title: 'runs-on labels' },
      enableSorting: false,
      header: () => (
        <HeaderHelp help={HELP.labels} label="runs-on labels">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <code className="normal-case">runs-on</code> labels
          </span>
        </HeaderHelp>
      ),
      cell: ({ row: { original: r } }) => (
        <div className="flex min-w-[250px] max-w-[340px] flex-wrap gap-1 whitespace-normal">
          {r.labels.map((l) => (
            <LabelChip key={l} label={l} />
          ))}
        </div>
      ),
    },
    {
      id: 'os',
      accessorKey: 'os',
      meta: { title: 'OS' },
      filterFn: inSet,
      header: ({ column }) => <DataTableColumnHeader column={column} title="OS" help={HELP.os} />,
      cell: ({ row }) => <OsBadge os={row.original.os} />,
    },
    {
      id: 'arch',
      accessorKey: 'arch',
      meta: { title: 'Arch' },
      filterFn: inSet,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Arch" help={HELP.arch} />,
      cell: ({ row }) => <ArchBadge arch={row.original.arch} />,
    },
    {
      id: 'vcpu',
      accessorFn: (r) => r.vcpu ?? undefined,
      meta: { title: 'vCPU' },
      sortingFn: 'basic',
      sortUndefined: 'last',
      header: ({ column }) => <DataTableColumnHeader column={column} title="vCPU" help={HELP.vcpu} align="right" />,
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">{row.original.vcpu ?? <Dash />}</div>
      ),
    },
    {
      id: 'memory',
      accessorFn: (r) => r.memoryGb ?? undefined,
      meta: { title: 'Memory' },
      sortingFn: 'basic',
      sortUndefined: 'last',
      header: ({ column }) => <DataTableColumnHeader column={column} title="RAM" help={HELP.memory} align="right" />,
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">
          {row.original.memoryGb == null ? <Dash /> : <>{row.original.memoryGb}<span className="text-muted-foreground"> GB</span></>}
        </div>
      ),
    },
    {
      id: 'disk',
      accessorFn: (r) => r.diskGb ?? undefined,
      meta: { title: 'Disk' },
      sortingFn: 'basic',
      sortUndefined: 'last',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Disk" help={HELP.disk} align="right" />,
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums whitespace-nowrap">
          {row.original.diskGb == null ? <Dash /> : <>{row.original.diskGb}<span className="text-muted-foreground"> GB</span></>}
        </div>
      ),
    },
    {
      id: 'price',
      accessorKey: 'price',
      meta: { title: 'Price' },
      sortingFn: 'basic',
      header: ({ column }) => <DataTableColumnHeader column={column} title={`Price $/${unit}`} help={priceHelp(unit)} align="right" />,
      cell: ({ row }) => <Price value={row.original.price} unit={unit} />,
    },
    {
      id: 'multiplier',
      accessorFn: (r) => r.multiplier ?? undefined,
      meta: { title: 'Multiplier' },
      sortingFn: 'basic',
      sortUndefined: 'last',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Billing ×" help={HELP.multiplier} align="right" />,
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">{row.original.multiplier == null ? <Dash /> : `${row.original.multiplier}×`}</div>
      ),
    },
    {
      id: 'flex',
      accessorFn: (r) => r.flex ?? undefined,
      meta: { title: 'Flex discount' },
      sortingFn: 'basic',
      sortUndefined: 'last',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Flex" help={HELP.flex} align="right" />,
      cell: ({ row: { original: r } }) =>
        r.flex == null ? (
          <div className="text-right"><Dash /></div>
        ) : (
          <div className="text-right">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help font-mono tabular-nums underline decoration-muted-foreground/40 decoration-dotted underline-offset-4">{r.flex}×</span>
              </TooltipTrigger>
              <TooltipContent>
                Flex scheduling: {Math.round(r.flex * 100)}% of list price ({formatPrice(r.price * r.flex, unit)}/{unit})
              </TooltipContent>
            </Tooltip>
          </div>
        ),
    },
    {
      id: 'publicFree',
      accessorFn: (r) => (r.publicFree ? 1 : 0),
      meta: { title: 'Free on public repos' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Public" help={HELP.publicFree} align="center" />,
      cell: ({ row }) => (
        <div className="flex justify-center">
          <PublicFree free={row.original.publicFree} />
        </div>
      ),
    },
    {
      id: 'asOf',
      accessorKey: 'asOf',
      meta: { title: 'Verified' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Verified" help={HELP.asOf} />,
      cell: ({ row: { original: r } }) => (
        <a
          href={r.source}
          target="_blank"
          rel="noopener noreferrer"
          title={`Source: ${new URL(r.source).hostname}`}
          aria-label={`Verified ${formatDate(r.asOf)}; pricing source for ${r.id}`}
          className="group/src inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground tabular-nums transition-colors hover:text-foreground"
        >
          {formatDate(r.asOf)}
          <ExternalLinkIcon className="size-3.5 opacity-60 group-hover/src:opacity-100" />
        </a>
      ),
    },
  ]
}

