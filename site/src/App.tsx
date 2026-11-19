import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { Hero, SiteFooter, SiteHeader } from '@/components/site'
import { RunnersTable } from '@/components/data-table/runners-table'

export default function App() {
  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col">
        <SiteHeader />
        <main className="flex-1">
          <Hero />
          <section id="runners" className="mx-auto max-w-7xl scroll-mt-16 px-4 py-12 sm:px-6 lg:px-8">
            <div className="mb-6 flex flex-col gap-1">
              <h2 className="text-2xl font-semibold tracking-tight">Runners</h2>
              <p className="text-sm text-muted-foreground">
                List prices in USD per runtime minute, before plan quotas, discounts and per-job rounding. Click a label to copy it; confirm prices at the source before relying on them.
              </p>
            </div>
            <RunnersTable />
          </section>
        </main>
        <SiteFooter />
      </div>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  )
}
