import fs from 'node:fs';
import path from 'node:path';

let envLoaded = false;
/** Carga un archivo .env si existe (sin sobrescribir variables ya definidas). */
function loadEnvFile() {
  if (envLoaded) return;
  envLoaded = true;
  const file = path.resolve('.env');
  if (process.env.NODE_ENV !== 'test' && fs.existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch (error) {
      console.warn('[config] No se pudo leer .env:', (error as Error).message);
    }
  }
}

export interface AppConfig {
  port: number;
  dataDir: string;
  clientDist: string;
  seedPhotosDir: string;
  isProd: boolean;
  cookieSecure: boolean;
  trustProxy: string | undefined;
  demoEnabled: boolean;
  allowRegistration: boolean;
  sessionDays: number;
  vapidSubject: string;
  /** Orígenes adicionales permitidos para peticiones que modifican datos (separados por comas). */
  allowedOrigins: string[];
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  loadEnvFile();
  const env = process.env;
  const isProd = env.NODE_ENV === 'production';
  return {
    port: Number(env.PORT ?? 3001),
    dataDir: path.resolve(env.DATA_DIR ?? 'data'),
    clientDist: path.resolve(env.CLIENT_DIST ?? 'dist/client'),
    seedPhotosDir: path.resolve(env.SEED_PHOTOS_DIR ?? 'server/seed/photos'),
    isProd,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
    trustProxy: env.TRUST_PROXY,
    demoEnabled: env.DEMO_ENABLED !== 'false',
    allowRegistration: env.ALLOW_REGISTRATION !== 'false',
    sessionDays: Number(env.SESSION_DAYS ?? 180),
    vapidSubject: env.VAPID_SUBJECT ?? 'mailto:comida-amor@example.com',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    ...overrides,
  };
}
