/** true en la versión que funciona solo en el navegador (sin servidor propio). */
export const IS_LOCAL = import.meta.env.VITE_LOCAL === '1';

/** true en la app publicada con Supabase (cuentas, datos y fotos en Supabase). */
export const IS_SUPABASE = import.meta.env.VITE_BACKEND === 'supabase';
