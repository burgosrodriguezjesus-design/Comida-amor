import { randomBytes, randomUUID } from 'node:crypto';
import type { DB } from '../db';
import { nowIso } from '../lib/time';
import { hashPassword } from '../auth/password';
import type { UserRow } from '../auth/sessions';
import { removeAllUserUploads } from './photos';

export const DEMO_EMAIL = 'demo@comidaamor.app';

export function findUserByEmail(db: DB, email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as UserRow | undefined;
}

export function findUserById(db: DB, id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export async function createUser(
  db: DB,
  data: { name: string; email: string; password: string; timezone: string; isDemo?: boolean },
): Promise<UserRow> {
  const now = nowIso();
  const row: UserRow = {
    id: randomUUID(),
    email: data.email.trim().toLowerCase(),
    name: data.name.trim(),
    password_hash: await hashPassword(data.password),
    is_demo: data.isDemo ? 1 : 0,
    timezone: data.timezone,
    demo_seeded_on: null,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, is_demo, timezone, demo_seeded_on, created_at, updated_at)
     VALUES (@id, @email, @name, @password_hash, @is_demo, @timezone, @demo_seeded_on, @created_at, @updated_at)`,
  ).run(row);
  return row;
}

export async function ensureDemoUser(db: DB, timezone: string): Promise<UserRow> {
  const existing = findUserByEmail(db, DEMO_EMAIL);
  if (existing) return existing;
  // La cuenta demo no tiene una contraseña conocida: solo se entra con el botón de demostración.
  return createUser(db, {
    name: 'Lucía',
    email: DEMO_EMAIL,
    password: randomBytes(24).toString('hex'),
    timezone,
    isDemo: true,
  });
}

export function deleteUser(db: DB, dataDir: string, userId: string): void {
  // ON DELETE CASCADE elimina sesiones, registros, alimentos, fotos, recordatorios y suscripciones.
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  removeAllUserUploads(dataDir, userId);
}
