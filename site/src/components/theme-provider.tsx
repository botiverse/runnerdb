import * as React from 'react'

export type Theme = 'light' | 'dark' | 'system'
type Ctx = { theme: Theme; resolved: 'light' | 'dark'; setTheme: (t: Theme) => void }

const KEY = 'runnerdb-theme'
const ThemeContext = React.createContext<Ctx | null>(null)
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'light' || t === 'dark' || t === 'system') return t
  } catch {
    /* storage unavailable */
  }
  return 'system'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(read)
  const [systemDark, setSystemDark] = React.useState(() => media().matches)

  React.useEffect(() => {
    const m = media()
    const on = () => setSystemDark(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  const setTheme = React.useCallback((t: Theme) => {
    try {
      localStorage.setItem(KEY, t)
    } catch {
      /* storage unavailable */
    }
    setThemeState(t)
  }, [])

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
