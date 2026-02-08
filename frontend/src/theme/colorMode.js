import { createContext, useContext } from 'react';

export const THEME_PREFERENCE_KEY = 'hotspot.themePreference';

export function normalizeThemePreference(value) {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

export function readStoredThemePreference() {
  if (typeof window === 'undefined') return 'system';

  try {
    const raw = window.localStorage.getItem(THEME_PREFERENCE_KEY);
    return normalizeThemePreference(raw);
  } catch {
    return 'system';
  }
}

export function writeStoredThemePreference(value) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(THEME_PREFERENCE_KEY, normalizeThemePreference(value));
  } catch {
    // Ignore storage failures (private mode, blocked storage, etc.)
  }
}

export const ColorModeContext = createContext(null);

export function useColorMode() {
  const ctx = useContext(ColorModeContext);
  if (!ctx) {
    throw new Error('useColorMode must be used within a ColorModeContext.Provider');
  }
  return ctx;
}
