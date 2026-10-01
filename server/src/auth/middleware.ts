import type { CookieOptions, NextFunction, Request, Response } from 'express';
import type { AppContext } from '../context';
import { HttpError } from '../lib/http';
import { findSessionUser, SESSION_COOKIE, type UserRow } from './sessions';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRow;
      sessionId?: string;
    }
  }
}

export function sessionCookieOptions(ctx: AppContext): CookieOptions {
  return {
    httpOnly: true,
    secure: ctx.config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: ctx.config.sessionDays * 86_400_000,
  };
}

/** Carga la usuaria de la sesión (si la hay) sin exigirla. */
export function loadSession(ctx: AppContext) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 20 && token.length < 100) {
      const found = findSessionUser(ctx.db, token, ctx.config.sessionDays);
      if (found) {
        req.user = found.user;
        req.sessionId = found.sessionId;
      }
    }
    next();
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    next(new HttpError(401, 'Tu sesión ha caducado. Vuelve a iniciar sesión.', 'unauthenticated'));
    return;
  }
  next();
}

/** Devuelve la usuaria autenticada (solo usar tras requireAuth). */
export function currentUser(req: Request): UserRow {
  if (!req.user) throw new HttpError(401, 'No has iniciado sesión.', 'unauthenticated');
  return req.user;
}
