export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'theme-v2'

export function getTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('light', theme === 'light')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch { /* private mode */ }
}
