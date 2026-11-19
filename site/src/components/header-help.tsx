import * as React from 'react'
import { CircleHelpIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// A table header label with a short explanation: shown as a tooltip when hovering the header (desktop)
// and as a popover from the small help icon on tap/click (touch). The icon is a sibling of the label,
// never inside it, so clicking it does not trigger the header's sort button.
export function HeaderHelp({
  help,
  label,
  children,
  className,
}: {
  help: React.ReactNode
  /** Plain-text column name for the icon's accessible label. */
  label: string
  children: React.ReactNode
  className?: string
}) {
  const [tip, setTip] = React.useState(false)
  const [pop, setPop] = React.useState(false)
  return (
    <Popover open={pop} onOpenChange={setPop}>
      <Tooltip open={tip && !pop} onOpenChange={setTip}>
        <PopoverAnchor asChild>
          <TooltipTrigger asChild>
            <span className={cn('inline-flex items-center gap-0.5 align-middle', className)}>
              {children}
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`What is ${label}?`}
                  className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:text-foreground"
                >
                  <CircleHelpIcon className="size-3" aria-hidden="true" />
                </button>
              </PopoverTrigger>
            </span>
          </TooltipTrigger>
        </PopoverAnchor>
        <TooltipContent className="text-left normal-case tracking-normal font-normal">{help}</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-64 p-3 text-xs leading-relaxed font-normal tracking-normal normal-case">{help}</PopoverContent>
    </Popover>
  )
}
