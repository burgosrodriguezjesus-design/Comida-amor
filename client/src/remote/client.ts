/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js';

// Interfaz mínima que usa la app (SupabaseClient real o, en pruebas, una simulación).
export type SupabaseLike = any;

let client: Promise<SupabaseLike> | null = null;

/** Cliente de Supabase con la sesión guardada en este dispositivo (se renueva sola). */
export function getSupabase(): Promise<SupabaseLike> {
  client ??= (async () => {
    if (import.meta.env.VITE_ALLOW_FAKE === '1') {
      const fake = (window as unknown as { __FAKE_SUPABASE__?: SupabaseLike }).__FAKE_SUPABASE__;
      if (fake) return fake;
    }
    const { createClient } = await import('@supabase/supabase-js');
    const url = import.meta.env.VITE_SUPABASE_URL as string;
    const key = import.meta.env.VITE_SUPABASE_KEY as string;
    if (!url || !key) throw new Error('Falta la configuración de Supabase.');
    const sb: SupabaseClient = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'comida-amor-sesion' },
    });
    return sb;
  })();
  return client;
}
