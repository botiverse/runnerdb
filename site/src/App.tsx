import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { SiteFooter, SiteHeader, SummaryLine } from '@/components/site'
import { RunnersTable } from '@/components/data-table/runners-table'

export default function App() {
  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col">
        <SiteHeader />
        <main id="runners" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-10 sm:px-6 lg:px-8">
          <h1 className="sr-only">runnerdb: CI runner prices, specs and billing rules</h1>
          <SummaryLine />
          <div className="mt-4">
            <RunnersTable />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            List prices in USD per runtime minute, before plan quotas, discounts and per-job rounding. Click a label to copy it; confirm prices at the source before relying on them.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Plans billed per month or per license are on a{' '}
            <a href="./flat-fee/" className="font-medium text-foreground underline underline-offset-4 hover:text-brand-fg">separate page</a>.
          </p>
        </main>
        <SiteFooter />
      </div>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  )
}
