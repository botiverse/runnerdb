import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { SiteFooter, SiteHeader } from '@/components/site'
import { CalculatorPage } from '@/components/calculator-page'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <div className="flex min-h-svh flex-col">
          <SiteHeader root="../" current="calc" />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-10 sm:px-6 lg:px-8">
            <CalculatorPage />
          </main>
          <SiteFooter root="../" />
        </div>
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
