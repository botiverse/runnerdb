import * as React from 'react'
import { MonitorIcon, MoonIcon, PlusIcon, StarIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
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

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <a href="./" className="flex items-center gap-2.5">
          <Logo className="size-7" />
          <span className="font-mono text-[15px] font-semibold tracking-tight">runnerdb</span>
        </a>
        <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex" aria-label="Main">
                    <a href="./api.json" className="rounded-md px-2.5 py-1.5 font-mono text-[13px] transition-colors hover:text-foreground">api.json</a>
          <a href="./schema.json" className="rounded-md px-2.5 py-1.5 font-mono text-[13px] transition-colors hover:text-foreground">schema.json</a>
          <a href={`${REPO}#readme`} className="rounded-md px-2.5 py-1.5 transition-colors hover:text-foreground">Docs</a>
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <a
            href={REPO}
            className="group inline-flex h-8 items-center overflow-hidden rounded-md border bg-background text-sm font-medium shadow-xs transition-colors hover:bg-accent dark:bg-input/30"
          >
            <span className="flex items-center gap-2 px-2.5">
              <GitHubIcon className="size-4" />
              <span className="hidden sm:inline">GitHub</span>
            </span>
            <span className="flex h-full items-center gap-1 border-l px-2.5 text-muted-foreground group-hover:text-foreground">
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

export function SiteFooter() {
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
            GitHub, Blacksmith and other provider names and logos are trademarks of their respective owners. runnerdb is not affiliated with or endorsed by them; logos are used only to identify each provider.
          </p>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
            <a className="hover:text-foreground" href={REPO}>GitHub</a>
            <a className="font-mono text-[13px] hover:text-foreground" href="./api.json">api.json</a>
            <a className="font-mono text-[13px] hover:text-foreground" href="./schema.json">schema.json</a>
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
