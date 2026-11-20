import * as React from 'react'
import { MenuIcon, MonitorIcon, MoonIcon, PlusIcon, StarIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme, type Theme } from '@/components/theme-provider'
import { GitHubIcon, Logo } from '@/components/icons'
import { asOf, formatDate, labelCount, providers, runners } from '@/lib/data'

export const REPO = 'https://github.com/botiverse/runnerdb'
const CONTRIBUTE = `${REPO}/blob/main/CONTRIBUTING.md`

function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Theme">
          {resolved === 'dark' ? <MoonIcon /> : <SunIcon />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <DropdownMenuRadioItem value="light"><SunIcon />Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><MoonIcon />Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><MonitorIcon />System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type Page = 'main' | 'calc' | 'flat'

// Header links. `page` marks the internal pages so the current one gets aria-current; `mono` is for the file links.
function navLinks(root: string): { href: string; label: string; page?: Page; mono?: boolean }[] {
  return [
    { href: root, label: 'Per-minute', page: 'main' },
    { href: `${root}calculator/`, label: 'Cost calculator', page: 'calc' },
    { href: `${root}flat-fee/`, label: 'Flat-fee plans', page: 'flat' },
    { href: `${root}api.json`, label: 'api.json', mono: true },
    { href: `${root}schema.json`, label: 'schema.json', mono: true },
    { href: `${REPO}#readme`, label: 'Docs' },
  ]
}

// root: relative path from the current page to the site root ('./' on the main page, '../' on calculator/ and flat-fee/).
// The inline nav needs about 1150 px next to the brand and the right-hand buttons, so below xl (1280 px) it collapses
// into a menu button; labels never wrap.
export function SiteHeader({ root = './', current = 'main' }: { root?: string; current?: Page }) {
  const links = navLinks(root)
  return (
    <header className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8 xl:gap-6">
        <a href={root} className="flex shrink-0 items-center gap-2.5" aria-label="runnerdb home">
          <Logo className="size-7" />
          <span className="hidden font-mono text-[15px] font-semibold tracking-tight min-[384px]:inline">runnerdb</span>
        </a>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-muted-foreground xl:hidden" aria-label="Menu">
              <MenuIcon />
              <span className="hidden md:inline">Menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {links.map((l) => (
              <DropdownMenuItem key={l.label} asChild className={cn(l.mono && 'font-mono text-[13px]', l.page && l.page === current && 'bg-accent/60 font-medium')}>
                <a href={l.href} aria-current={l.page && l.page === current ? 'page' : undefined}>{l.label}</a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <nav className="hidden items-center gap-1 text-sm whitespace-nowrap text-muted-foreground xl:flex" aria-label="Main">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              aria-current={l.page && l.page === current ? 'page' : undefined}
              className={cn('rounded-md px-2.5 py-1.5 whitespace-nowrap transition-colors hover:text-foreground', l.mono && 'font-mono text-[13px]', l.page && l.page === current && 'text-foreground')}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap sm:gap-2">
          <a
            href={REPO}
            aria-label="GitHub repository (star it)"
            className="group inline-flex h-8 items-center overflow-hidden rounded-md border bg-background text-sm font-medium shadow-xs transition-colors hover:bg-accent dark:bg-input/30"
          >
            <span className="flex items-center gap-2 px-2.5">
              <GitHubIcon className="size-4" />
              <span className="hidden sm:inline">GitHub</span>
            </span>
            <span className="hidden h-full items-center gap-1 border-l px-2.5 text-muted-foreground group-hover:text-foreground min-[440px]:flex">
              <StarIcon className="size-3.5" />
              <span className="hidden sm:inline">Star</span>
            </span>
          </a>
          <ThemeToggle />
          <Button asChild variant="brand" size="sm" className="h-8">
            <a href={CONTRIBUTE}>
              <PlusIcon />
              <span className="hidden sm:inline">Add or fix a price</span>
              <span className="sm:hidden">Add price</span>
            </a>
          </Button>
        </div>
      </div>
    </header>
  )
}

export function SummaryLine() {
  const items: [React.ReactNode, string][] = [
    [providers.length, 'providers'],
    [runners.length, 'runners'],
    [labelCount, 'labels'],
  ]
  return (
    <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <p>
        <span className="font-medium text-foreground">CI runner prices, specs and billing rules</span>
        <span className="hidden sm:inline"> · open data, every price linked to its source</span>
      </p>
      <ul className="flex flex-wrap items-center gap-1.5 text-xs">
        {items.map(([n, label]) => (
          <li key={label} className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5">
            <span className="font-mono font-medium text-foreground tabular-nums">{n}</span>
            {label}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-0.5">
          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          data as of <span className="font-medium text-foreground">{formatDate(asOf)}</span>
        </li>
      </ul>
    </div>
  )
}

export function SiteFooter({ root = './' }: { root?: string }) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
        <div className="max-w-md space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Logo className="size-5" />
            <span className="font-mono text-sm font-semibold">runnerdb</span>
          </div>
          <p className="text-xs leading-relaxed">
            Data is <a className="underline underline-offset-4 hover:text-foreground" href={`${REPO}/blob/main/DATA_LICENSE`}>CC0-1.0</a> (public domain); code is{' '}
            <a className="underline underline-offset-4 hover:text-foreground" href={`${REPO}/blob/main/LICENSE`}>MIT</a>.
          </p>
          <p className="text-xs leading-relaxed">
            Provider names and logos are trademarks of their respective owners. runnerdb is not affiliated with or endorsed by any provider; logos are used only to identify each provider.
          </p>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
            <a className="hover:text-foreground" href={REPO}>GitHub</a>
            <a className="hover:text-foreground" href={`${root}calculator/`}>Cost calculator</a>
            <a className="hover:text-foreground" href={`${root}flat-fee/`}>Flat-fee plans</a>
            <a className="font-mono text-[13px] hover:text-foreground" href={`${root}api.json`}>api.json</a>
            <a className="font-mono text-[13px] hover:text-foreground" href={`${root}schema.json`}>schema.json</a>
            <a className="hover:text-foreground" href={CONTRIBUTE}>Contribute</a>
          </nav>
          <p className="text-xs">
            Made by{' '}
            <a className="font-medium text-foreground underline-offset-4 hover:underline" href="https://stamp.build">
              Stamp
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
