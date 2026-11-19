import type { Column } from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  align = 'left',
  className,
}: {
  column: Column<TData, TValue>
  title: React.ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  if (!column.getCanSort()) return <div className={cn(align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>{title}</div>
  const s = column.getIsSorted()
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        '-mx-2 inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        s && 'text-foreground',
        align === 'right' && 'flex-row-reverse',
        className,
      )}
    >
      <span>{title}</span>
      {s === 'desc' ? (
        <ArrowDownIcon className="size-3.5 text-brand-fg" />
      ) : s === 'asc' ? (
        <ArrowUpIcon className="size-3.5 text-brand-fg" />
      ) : (
        <ChevronsUpDownIcon className="size-3.5 opacity-40" />
      )}
    </button>
  )
}
