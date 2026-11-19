import * as React from 'react'
import { toast } from 'sonner'
import { ArrowRightIcon, CheckIcon, CopyIcon, MonitorIcon, MoonIcon, PlusIcon, StarIcon, SunIcon } from 'lucide-react'
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
import { copyText } from '@/components/runner-bits'
import { asOf, cheapestPaid, formatDate, formatPrice, labelCount, providers, runners } from '@/lib/data'

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
          <a href="#runners" className="rounded-md px-2.5 py-1.5 transition-colors hover:text-foreground">Runners</a>
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

function CurlBox() {
  const cmd = 'curl -s https://runnerdb.stamp.build/api.json'
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex h-10 w-full max-w-md items-center gap-2 rounded-lg border bg-card/80 pr-1 pl-3 font-mono text-[13px] shadow-xs backdrop-blur">
      <span className="text-brand-fg select-none">$</span>
      <span className="truncate text-foreground/90">{cmd}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="ml-auto size-8"
        aria-label="Copy command"
        onClick={() =>
          copyText(cmd).then(() => {
            setCopied(true)
            toast.success('Command copied')
            setTimeout(() => setCopied(false), 1500)
          })
        }
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div className="rounded-xl border bg-card/80 p-4 shadow-xs backdrop-blur sm:p-5">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums sm:text-[28px]">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  )
}

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden border-b">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_40%,transparent_100%)]"
      />
      <div aria-hidden="true" className="absolute -top-40 left-1/2 -z-10 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-brand/20 blur-3xl dark:bg-brand/15" />
      <div className="mx-auto max-w-7xl px-4 pt-14 pb-12 sm:px-6 sm:pt-20 lg:px-8">
        <a
          href={`${REPO}/commits/main`}
          className="inline-flex items-center gap-2 rounded-full border bg-card/80 py-1 pr-3 pl-1 text-xs text-muted-foreground shadow-xs backdrop-blur transition-colors hover:text-foreground"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2 py-0.5 font-medium text-brand-fg">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-1.5 rounded-full bg-brand" />
            </span>
            Updated
          </span>
          Data as of {formatDate(asOf)}
          <ArrowRightIcon className="size-3" />
        </a>
        <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tighter text-balance sm:text-5xl lg:text-6xl">
          What does your CI runner{' '}
          <span className="bg-gradient-to-r from-brand to-fuchsia-500 bg-clip-text text-transparent dark:to-fuchsia-400">really cost?</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
          An open dataset of CI runner prices, specs and billing rules. Every <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground">runs-on</code> label, its
          price per minute and hardware, with a source link for every number.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="h-10">
            <a href="#runners">
              Browse runners
              <ArrowRightIcon />
            </a>
          </Button>
          <CurlBox />
        </div>
        <div className="mt-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Providers" value={providers.length} hint="Hosted and self-hosted" />
          <Stat label="Runner types" value={runners.length} hint="Linux, Windows, macOS" />
          <Stat label="runs-on labels" value={labelCount} hint="Exact and wildcard" />
          <Stat
            label="From"
            value={
              <>
                {formatPrice(cheapestPaid.price, 'min')}
                <span className="text-base font-normal text-muted-foreground">/min</span>
              </>
            }
            hint={`${cheapestPaid.providerShort} ${cheapestPaid.id}`}
          />
        </div>
      </div>
    </section>
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
            <a className="underline underline-offset-4 hover:text-foreground" href={`${REPO}/blob/main/LICENSE`}>MIT</a>. Provider names are trademarks of their owners; runnerdb is not affiliated with any provider.
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
