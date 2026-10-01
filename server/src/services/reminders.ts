import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { DB } from '../db';
import { nowIso } from '../lib/time';
import { LIMITS } from '../../../shared/constants';
import { isValidTime, nowInTimeZone, timeToMinutes } from '../../../shared/dates';
import type { ReminderTime } from '../../../shared/types';
import { lastEntryActivity } from './entries';
import type { PushPayload } from './push';

export const DEFAULT_REMINDER_TIMES: ReminderTime[] = [
  { id: 'desayuno', time: '09:30', enabled: true },
  { id: 'comida', time: '15:00', enabled: true },
  { id: 'cena', time: '21:45', enabled: true },
];

export const reminderSettingsSchema = z.object({
  enabled: z.boolean(),
  quietMinutes: z.number().int().min(0).max(240),
  times: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        time: z.string().refine(isValidTime, 'Hora no válida.'),
        enabled: z.boolean(),
      }),
    )
    .max(LIMITS.remindersPerUser, `Puedes configurar hasta ${LIMITS.remindersPerUser} recordatorios.`),
});

export interface StoredReminderSettings {
  enabled: boolean;
  quietMinutes: number;
  times: ReminderTime[];
}

export function getReminderSettings(db: DB, userId: string): StoredReminderSettings {
  const row = db.prepare('SELECT enabled, quiet_minutes, times FROM reminder_settings WHERE user_id = ?').get(userId) as
    | { enabled: number; quiet_minutes: number; times: string }
    | undefined;
  if (!row) return { enabled: false, quietMinutes: 60, times: DEFAULT_REMINDER_TIMES };
  let times: ReminderTime[] = [];
  try {
    times = JSON.parse(row.times);
  } catch {
    times = [];
  }
  return { enabled: row.enabled === 1, quietMinutes: row.quiet_minutes, times };
}

export function saveReminderSettings(db: DB, userId: string, settings: StoredReminderSettings): StoredReminderSettings {
  const times = [...settings.times]
    .map((t) => ({ ...t, id: t.id || randomUUID() }))
    .sort((a, b) => a.time.localeCompare(b.time));
  db.prepare(
    `INSERT INTO reminder_settings (user_id, enabled, quiet_minutes, times, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, quiet_minutes = excluded.quiet_minutes,
       times = excluded.times, updated_at = excluded.updated_at`,
  ).run(userId, settings.enabled ? 1 : 0, settings.quietMinutes, JSON.stringify(times), nowIso());
  return { ...settings, times };
}

const REMINDER_WINDOW_MINUTES = 15;

export const REMINDER_PAYLOAD: PushPayload = {
  title: 'Comida Amor',
  body: '¿Has registrado lo que acabas de comer?',
  url: '/?nuevo=rapido',
  tag: 'comida-amor-recordatorio',
};

/** ¿Ha registrado algo hace poco? En ese caso no molestamos. */
function recentlyLogged(db: DB, userId: string, quietMinutes: number, localDate: string, localTime: string, now: Date): boolean {
  if (quietMinutes <= 0) return false;
  const last = lastEntryActivity(db, userId);
  if (last.createdAt && now.getTime() - new Date(last.createdAt).getTime() <= quietMinutes * 60_000) return true;
  if (last.eatenAt && last.eatenAt.slice(0, 10) === localDate) {
    const diff = timeToMinutes(localTime) - timeToMinutes(last.eatenAt.slice(11, 16));
    if (diff >= 0 && diff <= quietMinutes) return true;
  }
  return false;
}

export async function sendToUser(ctx: AppContext, userId: string, payload: PushPayload): Promise<number> {
  const subs = ctx.db
    .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
    .all(userId) as { endpoint: string; p256dh: string; auth: string }[];
  let delivered = 0;
  for (const sub of subs) {
    const result = await ctx.push.send(sub, payload);
    if (result === 'ok') delivered += 1;
    if (result === 'gone') ctx.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
  }
  return delivered;
}

/** Revisa los recordatorios pendientes. Se ejecuta cada 30 segundos. */
export async function runReminderTick(ctx: AppContext, now = new Date()): Promise<void> {
  const rows = ctx.db
    .prepare(
      `SELECT rs.user_id, rs.quiet_minutes, rs.times, u.timezone FROM reminder_settings rs
       JOIN users u ON u.id = rs.user_id
       WHERE rs.enabled = 1 AND EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = rs.user_id)`,
    )
    .all() as { user_id: string; quiet_minutes: number; times: string; timezone: string }[];

  for (const row of rows) {
    let times: ReminderTime[] = [];
    try {
      times = JSON.parse(row.times);
    } catch {
      continue;
    }
    const local = nowInTimeZone(row.timezone, now);
    const nowMinutes = timeToMinutes(local.time);
    for (const reminder of times) {
      if (!reminder.enabled) continue;
      const elapsed = nowMinutes - timeToMinutes(reminder.time);
      if (elapsed < 0 || elapsed > REMINDER_WINDOW_MINUTES) continue;
      const claimed = ctx.db
        .prepare(
          `INSERT OR IGNORE INTO reminder_log (user_id, reminder_id, local_date, status, created_at) VALUES (?, ?, ?, 'pending', ?)`,
        )
        .run(row.user_id, reminder.id, local.date, nowIso());
      if (claimed.changes === 0) continue; // ya se gestionó hoy
      const skip = recentlyLogged(ctx.db, row.user_id, row.quiet_minutes, local.date, local.time, now);
      const status = skip ? 'skipped' : (await sendToUser(ctx, row.user_id, REMINDER_PAYLOAD)) > 0 ? 'sent' : 'failed';
      ctx.db
        .prepare('UPDATE reminder_log SET status = ? WHERE user_id = ? AND reminder_id = ? AND local_date = ?')
        .run(status, row.user_id, reminder.id, local.date);
    }
  }
}

export function purgeOldReminderLog(db: DB): void {
  const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  db.prepare('DELETE FROM reminder_log WHERE local_date < ?').run(cutoff);
}
