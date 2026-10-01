import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { currentUser, requireAuth, sessionCookieOptions } from '../auth/middleware';
import { hashPassword, verifyPassword } from '../auth/password';
import { deleteUserSessions, SESSION_COOKIE, toPublicUser, type UserRow } from '../auth/sessions';
import { HttpError, parse } from '../lib/http';
import { nowIso } from '../lib/time';
import { rateLimit } from '../security';
import { isValidTimeZone } from '../../../shared/dates';
import { deleteAllEntries, listEntries, listQuerySchema } from '../services/entries';
import { getReminderSettings } from '../services/reminders';
import { deleteUser, findUserById } from '../services/users';

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Escribe tu nombre.').max(60, 'El nombre es demasiado largo.').optional(),
  timezone: z.string().max(64).refine(isValidTimeZone, 'Zona horaria no válida.').optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Escribe tu contraseña actual.').max(200),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres.').max(200),
});

const confirmSchema = z.object({ password: z.string().max(200).optional() });

export function accountRoutes(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);
  const sensitiveLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, key: (req) => `sensitive:${req.user?.id}` });

  /** Las acciones destructivas exigen la contraseña (salvo en la cuenta de demostración). */
  async function confirmPassword(user: UserRow, password: string | undefined) {
    if (user.is_demo) return;
    if (!password || !(await verifyPassword(password, user.password_hash))) {
      throw new HttpError(403, 'La contraseña no es correcta.', 'wrong_password');
    }
  }

  router.patch('/', (req, res) => {
    const user = currentUser(req);
    const data = parse(profileSchema, req.body);
    if (data.name !== undefined) {
      ctx.db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?').run(data.name, nowIso(), user.id);
    }
    if (data.timezone !== undefined) {
      ctx.db.prepare('UPDATE users SET timezone = ?, updated_at = ? WHERE id = ?').run(data.timezone, nowIso(), user.id);
    }
    res.json({ user: toPublicUser(findUserById(ctx.db, user.id)!) });
  });

  router.post('/password', sensitiveLimiter, async (req, res) => {
    const user = currentUser(req);
    if (user.is_demo) throw new HttpError(403, 'La cuenta de demostración no tiene contraseña.');
    const data = parse(passwordSchema, req.body);
    await confirmPassword(user, data.currentPassword);
    ctx.db
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(await hashPassword(data.newPassword), nowIso(), user.id);
    // Por seguridad se cierran las demás sesiones abiertas.
    deleteUserSessions(ctx.db, user.id, req.sessionId);
    res.json({ ok: true });
  });

  router.post('/logout-all', (req, res) => {
    const user = currentUser(req);
    deleteUserSessions(ctx.db, user.id);
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(ctx), maxAge: undefined });
    res.json({ ok: true });
  });

  router.get('/export', (req, res) => {
    const user = currentUser(req);
    const query = parse(listQuerySchema, { order: 'asc', limit: '5000' });
    const all = [];
    for (let offset = 0; ; offset += query.limit) {
      const page = listEntries(ctx.db, user.id, { ...query, offset });
      all.push(...page.entries);
      if (!page.hasMore) break;
    }
    const payload = {
      exportedAt: nowIso(),
      app: 'Comida Amor',
      user: toPublicUser(user),
      reminders: getReminderSettings(ctx.db, user.id),
      entries: all,
    };
    res.setHeader('Content-Disposition', `attachment; filename="comida-amor-datos-${nowIso().slice(0, 10)}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.type('application/json').send(JSON.stringify(payload, null, 2));
  });

  router.post('/delete-entries', sensitiveLimiter, async (req, res) => {
    const user = currentUser(req);
    await confirmPassword(user, parse(confirmSchema, req.body).password);
    const deleted = deleteAllEntries(ctx.db, ctx.config.dataDir, user.id);
    res.json({ ok: true, deleted });
  });

  router.post('/delete', sensitiveLimiter, async (req, res) => {
    const user = currentUser(req);
    await confirmPassword(user, parse(confirmSchema, req.body).password);
    deleteUser(ctx.db, ctx.config.dataDir, user.id);
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(ctx), maxAge: undefined });
    res.json({ ok: true });
  });

  return router;
}
