import type { Column } from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HeaderHelp } from '@/components/header-help'

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  help,
  align = 'left',
  className,
}: {
  column: Column<TData, TValue>
  title: React.ReactNode
  /** Short explanation shown as a tooltip on hover and a popover from the help icon. */
  help?: React.ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  const label = typeof title === 'string' ? title : String((column.columnDef.meta as { title?: string } | undefined)?.title ?? column.id)
  const wrap = (node: React.ReactNode) =>
    help ? (
      <HeaderHelp help={help} label={label}>
        {node}
      </HeaderHelp>
    ) : (
      node
    )
  if (!column.getCanSort()) {
    return (
      <div className={cn(align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>
        {wrap(<span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</span>)}
      </div>
    )
  }
  const s = column.getIsSorted()
  return wrap(
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        '-mx-2 inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        help && 'mr-0 pr-1',
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
    </button>,
  )
}
