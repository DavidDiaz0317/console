/**
 * Theme system and utilities
 * Theme definitions extracted to themes-data.ts for better maintainability
 */

import { STORAGE_KEY_CUSTOM_THEMES } from './constants/storage'

// Export theme types and data
export type { Theme, ThemeFont, ThemeColors } from './themes-data'
export {
  kubestellar,
  kubestellarClassic,
  kubestellarLight,
  batman,
  dracula,
  nord,
  tokyoNight,
  monokai,
  gruvbox,
  catppuccin,
  matrix,
  cyberpunk,
  solarizedDark,
  ocean,
  forest,
  sunset,
  rosePine,
  oneDark,
  githubLight,
  synthwave,
  nightOwl,
  ayuDark,
  palenight,
  horizon,
  shadesOfPurple,
  everforest,
  kanagawa,
  moonlight,
  cobalt2,
} from './themes-data'

// Import theme definitions for aggregation
import {
  kubestellar,
  kubestellarClassic,
  kubestellarLight,
  batman,
  dracula,
  nord,
  tokyoNight,
  monokai,
  gruvbox,
  catppuccin,
  matrix,
  cyberpunk,
  solarizedDark,
  ocean,
  forest,
  sunset,
  rosePine,
  oneDark,
  githubLight,
  synthwave,
  nightOwl,
  ayuDark,
  palenight,
  horizon,
  shadesOfPurple,
  everforest,
  kanagawa,
  moonlight,
  cobalt2,
  type Theme,
} from './themes-data'

export const themes: Theme[] = [
  kubestellar,
  kubestellarClassic,
  kubestellarLight,
  batman,
  dracula,
  nord,
  tokyoNight,
  monokai,
  gruvbox,
  catppuccin,
  matrix,
  cyberpunk,
  solarizedDark,
  ocean,
  forest,
  sunset,
  rosePine,
  oneDark,
  githubLight,
  synthwave,
  nightOwl,
  ayuDark,
  palenight,
  horizon,
  shadesOfPurple,
  everforest,
  kanagawa,
  moonlight,
  cobalt2,
]

// Theme groups for UI organization
export const themeGroups = [
  {
    name: 'KubeStellar',
    themes: ['kubestellar', 'kubestellarClassic', 'kubestellarLight'],
  },
  {
    name: 'Popular',
    themes: ['dracula', 'nord', 'tokyoNight', 'monokai', 'gruvbox', 'catppuccin'],
  },
  {
    name: 'Dark & Moody',
    themes: ['batman', 'matrix', 'cyberpunk', 'ocean', 'nightOwl', 'palenight', 'cobalt2'],
  },
  {
    name: 'Light & Minimal',
    themes: ['githubLight', 'kubestellarLight'],
  },
  {
    name: 'Colorful',
    themes: ['sunset', 'rosePine', 'horizon', 'kanagawa', 'moonlight'],
  },
]

// Placeholder for default widths (from cardRegistry)
export const CARD_DEFAULT_WIDTHS: Record<string, number> = {}

/**
 * Get custom themes from localStorage
 */
export function getCustomThemes(): Theme[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CUSTOM_THEMES)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/**
 * Add a custom theme to localStorage
 */
export function addCustomTheme(theme: Theme): void {
  const custom = getCustomThemes()
  custom.push(theme)
  localStorage.setItem(STORAGE_KEY_CUSTOM_THEMES, JSON.stringify(custom))
}

/**
 * Remove a custom theme from localStorage
 */
export function removeCustomTheme(themeId: string): void {
  const custom = getCustomThemes()
  const filtered = custom.filter(t => t.id !== themeId)
  localStorage.setItem(STORAGE_KEY_CUSTOM_THEMES, JSON.stringify(filtered))
}

/**
 * Get all themes (built-in + custom)
 */
export function getAllThemes(): Theme[] {
  return [...themes, ...getCustomThemes()]
}

/**
 * Find a theme by ID
 */
export function getThemeById(id: string): Theme | undefined {
  return getAllThemes().find(t => t.id === id)
}

/**
 * Get the default theme
 */
export function getDefaultTheme(): Theme {
  return kubestellar
}
