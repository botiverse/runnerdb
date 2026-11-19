import type { Column } from '@tanstack/react-table'
import { CheckIcon, PlusCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

export type FacetOption = { label: string; value: string; icon?: React.ReactNode }

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: {
  column?: Column<TData, TValue>
  title: string
  options: FacetOption[]
}) {
  const facets = column?.getFacetedUniqueValues()
  const selected = new Set((column?.getFilterValue() as string[]) ?? [])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircleIcon />
          {title}
          {selected.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                {selected.size}
              </Badge>
              <div className="hidden gap-1 lg:flex">
                {selected.size > 2 ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {selected.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((o) => selected.has(o.value))
                    .map((o) => (
                      <Badge variant="secondary" key={o.value} className="rounded-sm px-1 font-normal">
                        {o.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const isSelected = selected.has(o.value)
                return (
                  <CommandItem
                    key={o.value}
                    onSelect={() => {
                      if (isSelected) selected.delete(o.value)
                      else selected.add(o.value)
                      const values = Array.from(selected)
                      column?.setFilterValue(values.length ? values : undefined)
                    }}
                  >
                    <div
                      className={cn(
                        'flex size-4 items-center justify-center rounded-[4px] border',
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input [&_svg]:invisible',
                      )}
                    >
                      <CheckIcon className="size-3.5 text-primary-foreground" />
                    </div>
                    {o.icon}
                    <span>{o.label}</span>
                    <span className="ml-auto flex size-4 items-center justify-center font-mono text-xs text-muted-foreground">
                      {facets?.get(o.value) ?? 0}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selected.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => column?.setFilterValue(undefined)} className="justify-center text-center">
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
