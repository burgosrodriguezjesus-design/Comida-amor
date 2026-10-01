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

/** Tema del sistema; en claude.ai el visor puede fijarlo con data-theme en <html>. */
function systemPrefersDark(): boolean {
  const hostTheme = document.documentElement.dataset.theme;
  if (hostTheme === 'dark') return true;
  if (hostTheme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(pref: ThemePreference) {
  const dark = pref === 'dark' || (pref === 'system' && systemPrefersDark());
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
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      media.removeEventListener('change', onChange);
      observer.disconnect();
    };
  }, [pref]);
  return [pref, setThemePreference] as const;
}
