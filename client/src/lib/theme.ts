import { useEffect, useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'ca-theme';

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

let current: ThemePreference = typeof window === 'undefined' ? 'system' : read();
const listeners = new Set<() => void>();

export function applyTheme(pref: ThemePreference) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1715' : '#fbf6f0');
}

export function setThemePreference(pref: ThemePreference) {
  current = pref;
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* almacenamiento no disponible */
  }
  applyTheme(pref);
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Preferencia de tema compartida por toda la app (sistema, claro u oscuro). */
export function useTheme() {
  const pref = useSyncExternalStore(subscribe, () => current);
  useEffect(() => {
    applyTheme(pref);
    if (pref !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [pref]);
  return [pref, setThemePreference] as const;
}
