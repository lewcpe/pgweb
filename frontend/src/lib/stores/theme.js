import { writable } from 'svelte/store';
const browser = typeof window !== 'undefined';

const THEME_KEY = 'theme';

/**
 * @typedef {'light' | 'dark' | 'system'} Theme
 */

/** @type {Theme} */
let initialTheme = 'system';

if (browser) {
  initialTheme = /** @type {Theme} */ (localStorage.getItem(THEME_KEY)) || 'system';
}

export const theme = writable(initialTheme);

theme.subscribe((value) => {
  if (browser) {
    localStorage.setItem(THEME_KEY, value);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (value === 'system') {
      document.documentElement.classList.toggle('dark', prefersDark);
    } else {
      document.documentElement.classList.toggle('dark', value === 'dark');
    }
  }
});

if (browser) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const currentTheme = localStorage.getItem(THEME_KEY);
    if (currentTheme === 'system') {
      document.documentElement.classList.toggle('dark', e.matches);
    }
  });
}