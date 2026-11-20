import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type FilterFn,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDownWideNarrowIcon, ExternalLinkIcon, SearchIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { OS_LABEL, flexDiscount, formatDate, formatPrice, providers, runners, type Runner, type Unit } from '@/lib/data'
import { ArchBadge, LabelChip, OsBadge, OsIcon, Price, ProviderAvatar, PublicFree } from '@/components/runner-bits'
import { makeColumns } from './columns'
import { DataTableFacetedFilter } from './faceted-filter'
import { DataTableViewOptions } from './view-options'

const globalFilter: FilterFn<Runner> = (row, _id, value: string) => {
  const r = row.original
  const hay = [r.providerName, r.provider, r.id, ...r.labels, r.os, OS_LABEL[r.os], r.osVersion ?? '', r.arch].join(' ').toLowerCase()
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t))
}

const hasAny = (f: (r: Runner) => unknown) => runners.some((r) => f(r) != null)

const MOBILE_SORTS: { value: string; label: string; sort: SortingState }[] = [
  { value: 'price-asc', label: 'Price: low to high', sort: [{ id: 'price', desc: false }] },
  { value: 'price-desc', label: 'Price: high to low', sort: [{ id: 'price', desc: true }] },
  { value: 'vcpu-desc', label: 'vCPU: most first', sort: [{ id: 'vcpu', desc: true }] },
  { value: 'runner-asc', label: 'Runner: A to Z', sort: [{ id: 'runner', desc: false }] },
]

export function RunnersTable() {
  const [unit, setUnit] = React.useState<Unit>('min')
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'price', desc: false }])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [query, setQuery] = React.useState('')
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({
    provider: false,
    memory: hasAny((r) => r.memoryGb),
    disk: hasAny((r) => r.diskGb),
    multiplier: hasAny((r) => r.multiplier),
    flex: hasAny((r) => r.flex),
  })
  const columns = React.useMemo(() => makeColumns(unit), [unit])

  const table = useReactTable({
    data: runners,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter: query },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setQuery,
    globalFilterFn: globalFilter,
    getRowId: (r) => r.key,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const rows = table.getRowModel().rows
  const filtered = columnFilters.length > 0 || query !== ''
  const reset = () => {
    setColumnFilters([])
    setQuery('')
  }
  const mobileSort = MOBILE_SORTS.find((s) => s.sort[0].id === sorting[0]?.id && s.sort[0].desc === sorting[0]?.desc)?.value ?? ''

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search runners or labels…"
              aria-label="Search runners or labels"
              className="h-8 pl-8"
              type="search"
            />
          </div>
          <DataTableFacetedFilter
            column={table.getColumn('provider')}
            title="Provider"
            options={providers.map((p) => ({ value: p.id, label: p.short, icon: <ProviderAvatar id={p.id} name={p.name} className="size-4 rounded-[4px] text-[7px] shadow-none" /> }))}
          />
          <DataTableFacetedFilter
            column={table.getColumn('os')}
            title="OS"
            options={(Object.keys(OS_LABEL) as Runner['os'][]).map((os) => ({ value: os, label: OS_LABEL[os], icon: <OsIcon os={os} className="size-4 text-muted-foreground" /> }))}
          />
          <DataTableFacetedFilter
            column={table.getColumn('arch')}
            title="Arch"
            options={[{ value: 'x64', label: 'x64' }, { value: 'arm64', label: 'arm64' }]}
          />
          {filtered && (
            <Button variant="ghost" size="sm" onClick={reset} className="h-8 px-2 lg:px-3">
              Reset
              <XIcon />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {rows.length === runners.length ? `${runners.length} runners` : `${rows.length} of ${runners.length} runners`}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 md:hidden">
                <ArrowDownWideNarrowIcon />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={mobileSort} onValueChange={(v) => setSorting(MOBILE_SORTS.find((s) => s.value === v)!.sort)}>
                {MOBILE_SORTS.map((s) => (
                  <DropdownMenuRadioItem key={s.value} value={s.value}>
                    {s.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <ToggleGroup type="single" value={unit} onValueChange={(v) => v && setUnit(v as Unit)} aria-label="Price unit">
            <ToggleGroupItem value="min" className="font-mono">$/min</ToggleGroupItem>
            <ToggleGroupItem value="h" className="font-mono">$/h</ToggleGroupItem>
          </ToggleGroup>
          <DataTableViewOptions table={table} />
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
        <Table>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const s = h.column.getIsSorted()
                  return (
                    <TableHead
                      key={h.id}
                      aria-sort={s === 'asc' ? 'ascending' : s === 'desc' ? 'descending' : undefined}
                      className={cn('h-11 px-2.5 first:pl-5 last:pr-5', ['vcpu', 'memory', 'disk', 'price', 'multiplier', 'flex'].includes(h.column.id) && 'text-right', h.column.id === 'publicFree' && 'text-center')}
                    >
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id} className="group">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-2.5 py-3 first:pl-5 last:pr-5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-32 text-center text-muted-foreground">
                  No runners match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Phone cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.length === 0 && <li className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No runners match these filters.</li>}
        {rows.map(({ original: r }) => (
          <li key={r.key} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <ProviderAvatar id={r.provider} name={r.providerName} className="size-9" />
                <div className="min-w-0">
                  <div className="truncate font-mono text-[13px] font-medium tracking-tight">{r.id}</div>
                  <div className="text-xs text-muted-foreground">{r.providerShort}</div>
                </div>
              </div>
              <Price value={r.price} unit={unit} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm">
              <OsBadge os={r.os} />
              <ArchBadge arch={r.arch} />
              {[r.vcpu != null && `${r.vcpu} vCPU`, r.memoryGb != null && `${r.memoryGb} GB RAM`, r.diskGb != null && `${r.diskGb} GB disk`, r.multiplier != null && `counts as ${r.multiplier} min`, r.flex != null && `flex ${formatPrice(r.price * r.flex, unit)}/${unit} (${flexDiscount(r.flex)})`]
                .filter(Boolean)
                .map((t) => (
                  <span key={String(t)} className="font-mono text-xs text-muted-foreground tabular-nums">{t}</span>
                ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {r.labels.map((l) => (
                <LabelChip key={l} label={l} />
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <PublicFree free={r.publicFree} />
                {r.publicFree ? 'Free for public repos' : 'Billed for public repos'}
              </span>
              <a href={r.source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                Checked {formatDate(r.asOf)}
                <ExternalLinkIcon className="size-3" />
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
