import { createHash, randomBytes } from 'node:crypto';
import type { DB } from '../db';
import { addDaysIso, nowIso } from '../lib/time';

export const SESSION_COOKIE = 'ca_sid';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  is_demo: number;
  timezone: string;
  demo_seeded_on: string | null;
  created_at: string;
  updated_at: string;
}

// En la base de datos solo se guarda el hash SHA-256 del token: si alguien
// obtuviera una copia de la base de datos no podría suplantar sesiones.
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(db: DB, userId: string, sessionDays: number, userAgent?: string): string {
  const token = randomBytes(32).toString('base64url');
  const now = nowIso();
  db.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(hashToken(token), userId, now, addDaysIso(sessionDays), now, userAgent?.slice(0, 300) ?? null);
  return token;
}

export function findSessionUser(
  db: DB,
  token: string,
  sessionDays: number,
): { user: UserRow; sessionId: string } | null {
  const sessionId = hashToken(token);
  const row = db
    .prepare('SELECT s.expires_at, s.last_seen_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?')
    .get(sessionId) as (UserRow & { expires_at: string; last_seen_at: string }) | undefined;
  if (!row) return null;
  const now = new Date();
  if (new Date(row.expires_at) <= now) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  // Sesión deslizante: se renueva como mucho una vez cada hora.
  if (now.getTime() - new Date(row.last_seen_at).getTime() > 3_600_000) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(
      now.toISOString(),
      addDaysIso(sessionDays, now),
      sessionId,
    );
  }
  const { expires_at: _e, last_seen_at: _l, ...user } = row;
  return { user, sessionId };
}

export function deleteSession(db: DB, sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function deleteUserSessions(db: DB, userId: string, exceptSessionId?: string): void {
  if (exceptSessionId) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(userId, exceptSessionId);
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

export function purgeExpiredSessions(db: DB): void {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
}

export function toPublicUser(user: UserRow) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isDemo: user.is_demo === 1,
    timezone: user.timezone,
    createdAt: user.created_at,
  };
}
