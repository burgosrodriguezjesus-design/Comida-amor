import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { getDummyHash, verifyPassword } from '../auth/password';
import { sessionCookieOptions } from '../auth/middleware';
import { createSession, deleteSession, SESSION_COOKIE, toPublicUser, type UserRow } from '../auth/sessions';
import { HttpError, parse } from '../lib/http';
import { rateLimit } from '../security';
import { isValidTimeZone, nowInTimeZone } from '../../../shared/dates';
import { createUser, ensureDemoUser, findUserByEmail } from '../services/users';
import { seedDemoData } from '../seed/demo';

const timezoneSchema = z
  .string()
  .max(64)
  .optional()
  .transform((tz) => (tz && isValidTimeZone(tz) ? tz : 'Europe/Madrid'));

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Escribe tu nombre.').max(60, 'El nombre es demasiado largo.'),
  email: z.email('Escribe un correo electrónico válido.').max(200),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .max(200, 'La contraseña es demasiado larga.'),
  timezone: timezoneSchema,
});

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo.').max(200),
  password: z.string().min(1, 'Escribe tu contraseña.').max(200),
});

export function authRoutes(ctx: AppContext): Router {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    key: (req) => `${req.ip}:${String(req.body?.email ?? '').toLowerCase()}`,
    message: 'Demasiados intentos de inicio de sesión. Espera 15 minutos y vuelve a intentarlo.',
  });
  const registerLimiter = rateLimit({ windowMs: 60 * 60_000, max: 10 });

  const startSession = (res: import('express').Response, user: UserRow, userAgent?: string) => {
    const token = createSession(ctx.db, user.id, ctx.config.sessionDays, userAgent);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(ctx));
  };

  router.get('/me', (req, res) => {
    if (!req.user) throw new HttpError(401, 'No has iniciado sesión.', 'unauthenticated');
    res.json({ user: toPublicUser(req.user) });
  });

  router.get('/options', (_req, res) => {
    res.json({ demoEnabled: ctx.config.demoEnabled, registrationEnabled: ctx.config.allowRegistration });
  });

  router.post('/register', registerLimiter, async (req, res) => {
    if (!ctx.config.allowRegistration) throw new HttpError(403, 'El registro de nuevas cuentas está desactivado.');
    const data = parse(registerSchema, req.body);
    if (findUserByEmail(ctx.db, data.email)) {
      throw new HttpError(409, 'Ya existe una cuenta con este correo. Prueba a iniciar sesión.', 'email_taken');
    }
    const user = await createUser(ctx.db, data);
    startSession(res, user, req.get('user-agent'));
    res.status(201).json({ user: toPublicUser(user) });
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const data = parse(loginSchema, req.body);
    const user = findUserByEmail(ctx.db, data.email);
    // Se verifica siempre un hash (aunque el correo no exista) para no revelar qué correos están registrados.
    const ok = await verifyPassword(data.password, user?.password_hash ?? (await getDummyHash()));
    if (!user || !ok || user.is_demo) {
      throw new HttpError(401, 'El correo o la contraseña no son correctos.', 'invalid_credentials');
    }
    startSession(res, user, req.get('user-agent'));
    res.json({ user: toPublicUser(user) });
  });

  router.post('/demo', rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
    if (!ctx.config.demoEnabled) throw new HttpError(404, 'La demostración no está disponible.');
    const timezone = parse(z.object({ timezone: timezoneSchema }), req.body ?? {}).timezone;
    const user = await ensureDemoUser(ctx.db, timezone);
    const local = nowInTimeZone(timezone);
    // Los datos de demostración se regeneran cada día para que siempre estén al día.
    if (user.demo_seeded_on !== local.date || user.timezone !== timezone) {
      seedDemoData(ctx, user.id, { today: local.date, now: local.time });
      ctx.db.prepare('UPDATE users SET demo_seeded_on = ?, timezone = ? WHERE id = ?').run(local.date, timezone, user.id);
      user.demo_seeded_on = local.date;
      user.timezone = timezone;
    }
    startSession(res, user, req.get('user-agent'));
    res.json({ user: toPublicUser(user) });
  });

  router.post('/logout', (req, res) => {
    if (req.sessionId) deleteSession(ctx.db, req.sessionId);
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(ctx), maxAge: undefined });
    res.json({ ok: true });
  });

  return router;
}
