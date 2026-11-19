import type { ColumnDef, FilterFn } from '@tanstack/react-table'
import { ExternalLinkIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDate, formatPrice, type Runner, type Unit } from '@/lib/data'
import { DataTableColumnHeader } from './column-header'
import { ArchBadge, LabelChip, OsBadge, Price, ProviderAvatar, PublicFree } from '@/components/runner-bits'

export const inSet: FilterFn<Runner> = (row, id, value: string[]) => value.includes(String(row.getValue(id)))

const Dash = () => <span className="text-muted-foreground/60">–</span>

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
      header: ({ column }) => <DataTableColumnHeader column={column} title="Runner" />,
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
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <code className="normal-case">runs-on</code> labels
        </span>
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="OS" />,
      cell: ({ row }) => <OsBadge os={row.original.os} />,
    },
    {
      id: 'arch',
      accessorKey: 'arch',
      meta: { title: 'Arch' },
      filterFn: inSet,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Arch" />,
      cell: ({ row }) => <ArchBadge arch={row.original.arch} />,
    },
    {
      id: 'vcpu',
      accessorFn: (r) => r.vcpu ?? undefined,
      meta: { title: 'vCPU' },
      sortUndefined: 'last',
      sortingFn: 'basic',
      header: ({ column }) => <DataTableColumnHeader column={column} title="vCPU" align="right" />,
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">{row.original.vcpu ?? <Dash />}</div>
      ),
    },
    {
      id: 'memory',
      accessorFn: (r) => r.memoryGb ?? undefined,
      meta: { title: 'Memory' },
      sortUndefined: 'last',
      sortingFn: 'basic',
      header: ({ column }) => <DataTableColumnHeader column={column} title="RAM" align="right" />,
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">
          {row.original.memoryGb == null ? <Dash /> : <>{row.original.memoryGb}<span className="text-muted-foreground"> GB</span></>}
        </div>
      ),
    },
    {
      id: 'price',
      // Flat-fee runners have no per-minute price: sort them after all metered/free runners in both directions.
      accessorFn: (r) => (r.flatFee ? undefined : r.price),
      meta: { title: 'Price' },
      sortUndefined: 'last',
      sortingFn: 'basic',
      header: ({ column }) => <DataTableColumnHeader column={column} title={`Price $/${unit}`} align="right" />,
      cell: ({ row }) => <Price value={row.original.price} flatFee={row.original.flatFee} unit={unit} />,
    },
    {
      id: 'multiplier',
      accessorFn: (r) => r.multiplier ?? undefined,
      meta: { title: 'Multiplier' },
      sortUndefined: 'last',
      sortingFn: 'basic',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mult." align="right" />,
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">{row.original.multiplier == null ? <Dash /> : `${row.original.multiplier}×`}</div>
      ),
    },
    {
      id: 'flex',
      accessorFn: (r) => r.flex ?? undefined,
      meta: { title: 'Flex discount' },
      sortUndefined: 'last',
      sortingFn: 'basic',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Flex" align="right" />,
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="Public" align="center" className="mx-auto" />,
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="Verified" />,
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

