// Light / dark / follow-the-system.
//
// DEVICE-LOCAL on purpose, unlike almost every other setting: appearance is a
// property of the screen you are holding (a phone at night, an iPad in a
// bright kitchen), so it does not sync and is not part of a backup - exactly
// how the OS itself treats it. Losing it costs one tap.
//
// index.html applies the stored choice inline before first paint, so the app
// never flashes light on a dark launch. This module is the runtime half: it
// re-applies on change and follows the OS while the choice is 'system'.

export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'expense-tracker.v1.theme';

export function loadThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const prefersDark = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;

function apply(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && prefersDark());
  const root = document.documentElement;
  if (dark) root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  // The browser chrome around the page (status bar in the installed app)
  // follows the page background.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#121214' : '#F5F5F7');
}

export function setThemeMode(mode: ThemeMode) {
  try {
    if (mode === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* storage unavailable - applies for this session only */
  }
  apply(mode);
}

/** Idempotent: applies the stored mode and starts following the OS. */
export function initThemeMode() {
  apply(loadThemeMode());
  if (typeof matchMedia === 'undefined') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    // Only 'system' follows the OS; an explicit choice stays put.
    apply(loadThemeMode());
  });
}
