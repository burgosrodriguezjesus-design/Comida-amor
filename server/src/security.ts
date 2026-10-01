import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config';
import { HttpError } from './lib/http';

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        frameSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
  });
}

/**
 * Defensa adicional frente a CSRF: las peticiones que modifican datos deben
 * venir del mismo origen que sirve la aplicación (además de la cookie SameSite=Lax).
 */
export function sameOriginGuard(config: AppConfig) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    const origin = req.get('origin');
    const fetchSite = req.get('sec-fetch-site');
    if (fetchSite === 'cross-site') {
      next(new HttpError(403, 'Origen no permitido.', 'forbidden_origin'));
      return;
    }
    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        /* origen inválido */
      }
      const host = req.get('x-forwarded-host') ?? req.get('host');
      if (originHost !== host && !config.allowedOrigins.includes(origin)) {
        next(new HttpError(403, 'Origen no permitido.', 'forbidden_origin'));
        return;
      }
    }
    next();
  };
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Limitador sencillo en memoria (suficiente para una instancia). */
export function rateLimit(options: { windowMs: number; max: number; key?: (req: Request) => string; message?: string }) {
  const buckets = new Map<string, Bucket>();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, options.windowMs);
  cleanup.unref();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = options.key ? options.key(req) : req.ip ?? 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      next(new HttpError(429, options.message ?? 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.', 'rate_limited'));
      return;
    }
    next();
  };
}
