import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { currentUser, requireAuth } from '../auth/middleware';
import { HttpError, parse } from '../lib/http';
import { nowIso } from '../lib/time';
import { rateLimit } from '../security';
import type { ReminderSettings } from '../../../shared/types';
import { getReminderSettings, reminderSettingsSchema, saveReminderSettings, sendToUser } from '../services/reminders';

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000).refine((u) => u.startsWith('https://'), 'Suscripción no válida.'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export function reminderRoutes(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  const view = (userId: string): ReminderSettings => {
    const settings = getReminderSettings(ctx.db, userId);
    const subs = ctx.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(userId) as { n: number };
    return {
      ...settings,
      pushConfigured: ctx.push.configured,
      publicKey: ctx.push.publicKey,
      subscriptions: subs.n,
    };
  };

  router.get('/reminders', (req, res) => {
    res.json(view(currentUser(req).id));
  });

  router.put('/reminders', (req, res) => {
    const user = currentUser(req);
    saveReminderSettings(ctx.db, user.id, parse(reminderSettingsSchema, req.body));
    res.json(view(user.id));
  });

  router.post('/push/subscribe', (req, res) => {
    const user = currentUser(req);
    const sub = parse(subscriptionSchema, req.body);
    ctx.db
      .prepare(
        `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      )
      .run(randomUUID(), user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth, req.get('user-agent')?.slice(0, 300) ?? null, nowIso());
    res.json(view(user.id));
  });

  router.post('/push/unsubscribe', (req, res) => {
    const user = currentUser(req);
    const { endpoint } = parse(z.object({ endpoint: z.string().max(1000) }), req.body);
    ctx.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, user.id);
    res.json(view(user.id));
  });

  router.post('/push/test', rateLimit({ windowMs: 60_000, max: 5, key: (req) => `pushtest:${req.user?.id}` }), async (req, res) => {
    const user = currentUser(req);
    const delivered = await sendToUser(ctx, user.id, {
      title: 'Comida Amor',
      body: 'Así se verán tus recordatorios. ¡Todo listo!',
      url: '/',
      tag: 'comida-amor-prueba',
    });
    if (delivered === 0) throw new HttpError(409, 'No se pudo enviar la notificación a este dispositivo. Vuelve a activar los recordatorios.');
    res.json({ ok: true, delivered });
  });

  return router;
}
