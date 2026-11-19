import type { Theme } from '../types'

/** Browser chrome color for each theme. Matches --bg in styles.css. */
const THEME_COLOR: Record<Theme, string> = { dark: '#0e1014', light: '#f4f5f7' }

/**
 * Put the theme on <html> (styles.css keys off data-theme) and update the
 * browser chrome to match. index.html runs the same logic before first paint.
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'light') root.dataset.theme = 'light'
  else delete root.dataset.theme
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.setAttribute('content', theme)
}
