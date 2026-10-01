import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../db';
import { nowIso } from '../lib/time';
import type { EntryPhoto } from '../../../shared/types';

export interface PhotoRow {
  id: string;
  user_id: string;
  entry_id: string | null;
  position: number;
  mime: string;
  thumb_mime: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number;
  created_at: string;
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Comprueba la firma real del archivo (no nos fiamos de la extensión ni del Content-Type). */
export function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function userUploadsDir(dataDir: string, userId: string): string {
  // userId es siempre un UUID generado por el servidor, nunca un dato de la usuaria.
  return path.join(dataDir, 'uploads', userId);
}

export function photoFilePath(dataDir: string, row: Pick<PhotoRow, 'id' | 'user_id' | 'mime' | 'thumb_mime'>, variant: 'full' | 'thumb'): string {
  const mime = variant === 'thumb' && row.thumb_mime ? row.thumb_mime : row.mime;
  const suffix = variant === 'thumb' && row.thumb_mime ? '_thumb' : '';
  return path.join(userUploadsDir(dataDir, row.user_id), `${row.id}${suffix}.${EXTENSIONS[mime] ?? 'bin'}`);
}

export function photoToDto(row: Pick<PhotoRow, 'id' | 'width' | 'height'>): EntryPhoto {
  return {
    id: row.id,
    url: `/api/photos/${row.id}`,
    thumbUrl: `/api/photos/${row.id}?size=thumb`,
    width: row.width,
    height: row.height,
  };
}

export function savePhoto(
  db: DB,
  dataDir: string,
  userId: string,
  data: { full: Buffer; fullMime: string; thumb?: Buffer; thumbMime?: string | null; width?: number | null; height?: number | null },
): PhotoRow {
  const row: PhotoRow = {
    id: randomUUID(),
    user_id: userId,
    entry_id: null,
    position: 0,
    mime: data.fullMime,
    thumb_mime: data.thumb && data.thumbMime ? data.thumbMime : null,
    width: data.width ?? null,
    height: data.height ?? null,
    size_bytes: data.full.length + (data.thumb?.length ?? 0),
    created_at: nowIso(),
  };
  const dir = userUploadsDir(dataDir, userId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(photoFilePath(dataDir, row, 'full'), data.full, { mode: 0o600 });
  if (row.thumb_mime && data.thumb) {
    fs.writeFileSync(photoFilePath(dataDir, row, 'thumb'), data.thumb, { mode: 0o600 });
  }
  db.prepare(
    `INSERT INTO photos (id, user_id, entry_id, position, mime, thumb_mime, width, height, size_bytes, created_at)
     VALUES (@id, @user_id, @entry_id, @position, @mime, @thumb_mime, @width, @height, @size_bytes, @created_at)`,
  ).run(row);
  return row;
}

export function getPhoto(db: DB, userId: string, id: string): PhotoRow | undefined {
  return db.prepare('SELECT * FROM photos WHERE id = ? AND user_id = ?').get(id, userId) as PhotoRow | undefined;
}

export function removePhotoFiles(dataDir: string, rows: Pick<PhotoRow, 'id' | 'user_id' | 'mime' | 'thumb_mime'>[]): void {
  for (const row of rows) {
    for (const variant of ['full', 'thumb'] as const) {
      if (variant === 'thumb' && !row.thumb_mime) continue;
      fs.rmSync(photoFilePath(dataDir, row, variant), { force: true });
    }
  }
}

/** Borra fotos subidas que nunca llegaron a guardarse en un registro (más de 24 h). */
export function purgeOrphanPhotos(db: DB, dataDir: string): number {
  const cutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const rows = db.prepare('SELECT * FROM photos WHERE entry_id IS NULL AND created_at < ?').all(cutoff) as PhotoRow[];
  if (rows.length === 0) return 0;
  db.prepare('DELETE FROM photos WHERE entry_id IS NULL AND created_at < ?').run(cutoff);
  removePhotoFiles(dataDir, rows);
  return rows.length;
}

export function removeAllUserUploads(dataDir: string, userId: string): void {
  fs.rmSync(userUploadsDir(dataDir, userId), { recursive: true, force: true });
}
