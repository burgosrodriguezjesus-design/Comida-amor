import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { AppContext } from './context';
import { loadSession } from './auth/middleware';
import { errorHandler, HttpError } from './lib/http';
import { accountRoutes } from './routes/account';
import { authRoutes } from './routes/auth';
import { entryRoutes } from './routes/entries';
import { photoRoutes } from './routes/photos';
import { reminderRoutes } from './routes/reminders';
import { sameOriginGuard, securityHeaders } from './security';

export function createApp(ctx: AppContext): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (ctx.config.trustProxy) {
    const value = ctx.config.trustProxy;
    app.set('trust proxy', /^\d+$/.test(value) ? Number(value) : value === 'true' ? true : value);
  }

  app.use(securityHeaders());
  app.use(cookieParser());
  app.use(express.json({ limit: '200kb' }));

  const api = express.Router();
  api.use((_req, res, next) => {
    // Los datos personales nunca deben quedarse en cachés intermedias.
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(sameOriginGuard(ctx.config));
  api.use(loadSession(ctx));
  api.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  api.use('/auth', authRoutes(ctx));
  api.use('/account', accountRoutes(ctx));
  api.use(entryRoutes(ctx));
  api.use(photoRoutes(ctx));
  api.use(reminderRoutes(ctx));
  api.use(() => {
    throw new HttpError(404, 'Ruta no encontrada.');
  });
  app.use('/api', api);

  // Aplicación web compilada (en producción).
  const dist = ctx.config.clientDist;
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(
      express.static(dist, {
        index: false,
        setHeaders(res, file) {
          if (file.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'no-cache');
          }
          if (file.endsWith('sw.js')) res.setHeader('Service-Worker-Allowed', '/');
        },
      }),
    );
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
