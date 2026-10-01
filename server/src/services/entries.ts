import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DB } from '../db';
import { HttpError } from '../lib/http';
import { nowIso } from '../lib/time';
import {
  ITEM_KINDS,
  LIMITS,
  MEAL_TYPE_IDS,
  MEAL_TYPE_LABELS,
  SYMPTOM_IDS,
  SYMPTOM_LABELS,
  normalizeSymptoms,
  type MealType,
  type SymptomCode,
} from '../../../shared/constants';
import { isValidDate, isValidDateTime } from '../../../shared/dates';
import { capitalizeFirst, escapeLike, normalizeText } from '../../../shared/text';
import type { Entry, EntryItem, EntryListResponse } from '../../../shared/types';
import { photoToDto, removePhotoFiles, type PhotoRow } from './photos';

interface EntryRow {
  id: string;
  user_id: string;
  eaten_at: string;
  meal_type: MealType;
  notes: string;
  feeling_note: string;
  symptoms: string;
  other_symptoms: string;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  entry_id: string;
  position: number;
  name: string;
  quantity: string;
  kind: 'food' | 'drink';
}

// ---------- Validación ----------

const itemSchema = z.object({
  name: z.string().trim().min(1, 'Cada alimento necesita un nombre.').max(LIMITS.itemName, 'El nombre es demasiado largo.'),
  quantity: z.string().trim().max(LIMITS.quantity, 'La cantidad es demasiado larga.').default(''),
  kind: z.enum(ITEM_KINDS),
});

export const entryInputSchema = z
  .object({
    eatenAt: z.string().refine(isValidDateTime, 'La fecha u hora no es válida.'),
    mealType: z.enum(MEAL_TYPE_IDS, 'Elige un tipo de comida.'),
    items: z.array(itemSchema).max(LIMITS.itemsPerEntry, 'Hay demasiados alimentos en un solo registro.').default([]),
    notes: z.string().trim().max(LIMITS.notes, 'Las notas son demasiado largas.').default(''),
    feelingNote: z.string().trim().max(LIMITS.notes, 'La nota es demasiado larga.').default(''),
    symptoms: z.array(z.enum(SYMPTOM_IDS)).max(SYMPTOM_IDS.length).default([]),
    otherSymptoms: z.string().trim().max(LIMITS.otherSymptoms, 'El texto de otros síntomas es demasiado largo.').default(''),
    photoIds: z.array(z.uuid()).max(LIMITS.photosPerEntry, `Puedes añadir hasta ${LIMITS.photosPerEntry} fotos.`).default([]),
  })
  .refine((d) => d.items.length > 0 || d.notes.length > 0, 'Escribe al menos un alimento o bebida.');

export type EntryInputParsed = z.infer<typeof entryInputSchema>;

export const listQuerySchema = z.object({
  from: z.string().refine(isValidDate, 'Fecha inicial no válida.').optional(),
  to: z.string().refine(isValidDate, 'Fecha final no válida.').optional(),
  q: z.string().trim().max(100).optional(),
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter((t): t is MealType => (MEAL_TYPE_IDS as string[]).includes(t)) : [])),
  food: z.string().trim().max(LIMITS.itemName).optional(),
  symptoms: z.enum(['1', '0']).optional(),
  photos: z.enum(['1', '0']).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(5000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

// ---------- Lectura ----------

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

export function hydrateEntries(db: DB, rows: EntryRow[]): Entry[] {
  if (rows.length === 0) return [];
  const items = new Map<string, EntryItem[]>();
  const photos = new Map<string, Entry['photos']>();
  for (const ids of chunk(rows.map((r) => r.id), 500)) {
    const marks = ids.map(() => '?').join(',');
    const itemRows = db
      .prepare(`SELECT id, entry_id, position, name, quantity, kind FROM entry_items WHERE entry_id IN (${marks}) ORDER BY position`)
      .all(...ids) as ItemRow[];
    for (const item of itemRows) {
      const list = items.get(item.entry_id) ?? [];
      list.push({ id: item.id, name: item.name, quantity: item.quantity, kind: item.kind });
      items.set(item.entry_id, list);
    }
    const photoRows = db
      .prepare(`SELECT id, entry_id, width, height FROM photos WHERE entry_id IN (${marks}) ORDER BY position, created_at`)
      .all(...ids) as Pick<PhotoRow, 'id' | 'entry_id' | 'width' | 'height'>[];
    for (const photo of photoRows) {
      const list = photos.get(photo.entry_id!) ?? [];
      list.push(photoToDto(photo));
      photos.set(photo.entry_id!, list);
    }
  }
  return rows.map((row) => ({
    id: row.id,
    eatenAt: row.eaten_at,
    mealType: row.meal_type,
    items: items.get(row.id) ?? [],
    notes: row.notes,
    feelingNote: row.feeling_note,
    symptoms: safeSymptoms(row.symptoms),
    otherSymptoms: row.other_symptoms,
    photos: photos.get(row.id) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function safeSymptoms(value: string): SymptomCode[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((s) => (SYMPTOM_IDS as string[]).includes(s)) : [];
  } catch {
    return [];
  }
}

export function listEntries(db: DB, userId: string, query: ListQuery): EntryListResponse {
  const where: string[] = ['e.user_id = ?'];
  const params: unknown[] = [userId];
  if (query.from) {
    where.push('e.eaten_at >= ?');
    params.push(`${query.from}T00:00`);
  }
  if (query.to) {
    where.push('e.eaten_at <= ?');
    params.push(`${query.to}T23:59`);
  }
  if (query.q) {
    // Todas las palabras deben aparecer (sin distinguir tildes ni mayúsculas).
    for (const word of normalizeText(query.q).split(' ').filter(Boolean).slice(0, 8)) {
      where.push("e.search_text LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(word)}%`);
    }
  }
  if (query.types.length > 0) {
    where.push(`e.meal_type IN (${query.types.map(() => '?').join(',')})`);
    params.push(...query.types);
  }
  if (query.food) {
    where.push('EXISTS (SELECT 1 FROM entry_items i WHERE i.entry_id = e.id AND i.name_norm = ?)');
    params.push(normalizeText(query.food));
  }
  if (query.symptoms === '1') {
    where.push(`e.symptoms NOT IN ('[]', '["sin_sintomas"]')`);
  }
  if (query.photos === '1') {
    where.push('EXISTS (SELECT 1 FROM photos p WHERE p.entry_id = e.id)');
  }
  const whereSql = where.join(' AND ');
  const counts = db
    .prepare(`SELECT COUNT(*) AS total, COUNT(DISTINCT substr(e.eaten_at, 1, 10)) AS days FROM entries e WHERE ${whereSql}`)
    .get(...params) as { total: number; days: number };
  const order = query.order === 'asc' ? 'ASC' : 'DESC';
  const rows = db
    .prepare(`SELECT e.* FROM entries e WHERE ${whereSql} ORDER BY e.eaten_at ${order}, e.created_at ${order} LIMIT ? OFFSET ?`)
    .all(...params, query.limit, query.offset) as EntryRow[];
  return {
    entries: hydrateEntries(db, rows),
    total: counts.total,
    dayCount: counts.days,
    hasMore: query.offset + rows.length < counts.total,
  };
}

export function getEntry(db: DB, userId: string, id: string): Entry | null {
  const row = db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(id, userId) as EntryRow | undefined;
  return row ? hydrateEntries(db, [row])[0] : null;
}

// ---------- Escritura ----------

function buildSearchText(input: EntryInputParsed): string {
  const parts = [
    MEAL_TYPE_LABELS[input.mealType],
    ...input.items.flatMap((i) => [i.name, i.quantity]),
    input.notes,
    input.feelingNote,
    ...input.symptoms.map((s) => SYMPTOM_LABELS[s]),
    input.otherSymptoms,
  ];
  return normalizeText(parts.filter(Boolean).join(' · '));
}

function prepareInput(input: EntryInputParsed): EntryInputParsed {
  const symptoms = normalizeSymptoms(input.symptoms, input.otherSymptoms);
  return {
    ...input,
    items: input.items.map((i) => ({ ...i, name: capitalizeFirst(i.name) })),
    symptoms,
    otherSymptoms: symptoms.includes('otros') ? input.otherSymptoms : '',
  };
}

function writeItems(db: DB, userId: string, entryId: string, items: EntryInputParsed['items']): void {
  const insert = db.prepare(
    'INSERT INTO entry_items (id, entry_id, user_id, position, name, name_norm, quantity, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  items.forEach((item, index) => {
    insert.run(randomUUID(), entryId, userId, index, item.name, normalizeText(item.name), item.quantity, item.kind);
  });
}

/**
 * Vincula las fotos indicadas al registro y devuelve las que ya no forman parte de él
 * (para borrar sus archivos fuera de la transacción).
 */
function syncPhotos(db: DB, userId: string, entryId: string, photoIds: string[]): PhotoRow[] {
  const unique = Array.from(new Set(photoIds));
  for (const id of unique) {
    const photo = db.prepare('SELECT entry_id FROM photos WHERE id = ? AND user_id = ?').get(id, userId) as
      | { entry_id: string | null }
      | undefined;
    if (!photo) throw new HttpError(400, 'Una de las fotos ya no está disponible. Vuelve a añadirla.', 'photo_missing');
    if (photo.entry_id && photo.entry_id !== entryId) {
      throw new HttpError(400, 'Una de las fotos pertenece a otro registro.', 'photo_conflict');
    }
  }
  const current = db.prepare('SELECT * FROM photos WHERE entry_id = ? AND user_id = ?').all(entryId, userId) as PhotoRow[];
  const removed = current.filter((p) => !unique.includes(p.id));
  for (const photo of removed) db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  unique.forEach((id, position) => {
    db.prepare('UPDATE photos SET entry_id = ?, position = ? WHERE id = ? AND user_id = ?').run(entryId, position, id, userId);
  });
  return removed;
}

export function createEntry(db: DB, dataDir: string, userId: string, raw: EntryInputParsed): Entry {
  const input = prepareInput(raw);
  const id = randomUUID();
  const now = nowIso();
  const removed = db.transaction(() => {
    db.prepare(
      `INSERT INTO entries (id, user_id, eaten_at, meal_type, notes, feeling_note, symptoms, other_symptoms, search_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      input.eatenAt,
      input.mealType,
      input.notes,
      input.feelingNote,
      JSON.stringify(input.symptoms),
      input.otherSymptoms,
      buildSearchText(input),
      now,
      now,
    );
    writeItems(db, userId, id, input.items);
    return syncPhotos(db, userId, id, input.photoIds);
  })();
  removePhotoFiles(dataDir, removed);
  return getEntry(db, userId, id)!;
}

export function updateEntry(db: DB, dataDir: string, userId: string, id: string, raw: EntryInputParsed): Entry | null {
  const input = prepareInput(raw);
  const exists = db.prepare('SELECT 1 FROM entries WHERE id = ? AND user_id = ?').get(id, userId);
  if (!exists) return null;
  const removed = db.transaction(() => {
    db.prepare(
      `UPDATE entries SET eaten_at = ?, meal_type = ?, notes = ?, feeling_note = ?, symptoms = ?, other_symptoms = ?,
              search_text = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    ).run(
      input.eatenAt,
      input.mealType,
      input.notes,
      input.feelingNote,
      JSON.stringify(input.symptoms),
      input.otherSymptoms,
      buildSearchText(input),
      nowIso(),
      id,
      userId,
    );
    db.prepare('DELETE FROM entry_items WHERE entry_id = ? AND user_id = ?').run(id, userId);
    writeItems(db, userId, id, input.items);
    return syncPhotos(db, userId, id, input.photoIds);
  })();
  removePhotoFiles(dataDir, removed);
  return getEntry(db, userId, id);
}

export function deleteEntry(db: DB, dataDir: string, userId: string, id: string): boolean {
  const photos = db.prepare('SELECT * FROM photos WHERE entry_id = ? AND user_id = ?').all(id, userId) as PhotoRow[];
  const result = db.transaction(() => {
    db.prepare('DELETE FROM photos WHERE entry_id = ? AND user_id = ?').run(id, userId);
    return db.prepare('DELETE FROM entries WHERE id = ? AND user_id = ?').run(id, userId);
  })();
  if (result.changes === 0) return false;
  removePhotoFiles(dataDir, photos);
  return true;
}

export function deleteAllEntries(db: DB, dataDir: string, userId: string): number {
  const photos = db.prepare('SELECT * FROM photos WHERE user_id = ?').all(userId) as PhotoRow[];
  const result = db.transaction(() => {
    db.prepare('DELETE FROM photos WHERE user_id = ?').run(userId);
    return db.prepare('DELETE FROM entries WHERE user_id = ?').run(userId);
  })();
  removePhotoFiles(dataDir, photos);
  return result.changes;
}

/** Último momento registrado (para no enviar recordatorios si acaba de registrar algo). */
export function lastEntryActivity(db: DB, userId: string): { eatenAt: string | null; createdAt: string | null } {
  const row = db
    .prepare('SELECT MAX(eaten_at) AS eatenAt, MAX(created_at) AS createdAt FROM entries WHERE user_id = ?')
    .get(userId) as { eatenAt: string | null; createdAt: string | null };
  return row;
}
