import { useEffect } from 'react';

const CACHE_KEY = 'fos.theme';
const prefersDark = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);

/**
 * Light/dark choice: 'light' | 'dark' | 'system', stored in the new field
 * preferences.appearance. Falls back to the original app's preferences.darkMode.
 *
 * NOTE: preferences.theme is NOT ours. An older version (Update_21) stored a
 * colour-scheme name there (e.g. "ocean"), and real data still has it, so we
 * never read or overwrite it.
 */
const APPEARANCES = ['light', 'dark', 'system'];
export const themeFrom = (prefs) =>
  APPEARANCES.includes(prefs?.appearance) ? prefs.appearance : prefs?.darkMode ? 'dark' : 'light';

/** Returns new preferences. Keeps the original app's darkMode in step so it still looks right there. */
export const withTheme = (prefs, appearance) => ({
  ...prefs,
  appearance,
  darkMode: appearance === 'dark' || (appearance === 'system' && prefersDark()),
});

function apply(theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/** Apply the theme to the page; remembered on this device so the sign-in screen matches too. */
export function useApplyTheme(theme) {
  useEffect(() => {
    if (!theme) return;
    apply(theme);
    try {
      localStorage.setItem(CACHE_KEY, theme);
    } catch {
      /* storage unavailable: fine */
    }
  }, [theme]);
}

export function applyCachedTheme() {
  try {
    const t = localStorage.getItem(CACHE_KEY);
    if (APPEARANCES.includes(t)) apply(t);
  } catch {
    /* storage unavailable: fine */
  }
}
