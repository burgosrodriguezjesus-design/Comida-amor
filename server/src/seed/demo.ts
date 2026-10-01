// Datos de demostración realistas (dieta española) para probar todas las pantallas.
// Las fechas son relativas al día de hoy, así que siempre parecen recientes.

import fs from 'node:fs';
import path from 'node:path';
import type { AppContext } from '../context';
import { buildDemoPlan } from '../../../shared/demoPlan';
import { createEntry, deleteAllEntries } from '../services/entries';
import { savePhoto } from '../services/photos';

export function seedDemoData(ctx: AppContext, userId: string, options: { today: string; now: string; days?: number }): number {
  deleteAllEntries(ctx.db, ctx.config.dataDir, userId);

  const photoCache = new Map<string, { full: Buffer; thumb?: Buffer } | null>();
  const loadPhoto = (name: string) => {
    if (!photoCache.has(name)) {
      const full = path.join(ctx.config.seedPhotosDir, `${name}.jpg`);
      const thumb = path.join(ctx.config.seedPhotosDir, `${name}_thumb.jpg`);
      photoCache.set(
        name,
        fs.existsSync(full) ? { full: fs.readFileSync(full), thumb: fs.existsSync(thumb) ? fs.readFileSync(thumb) : undefined } : null,
      );
    }
    return photoCache.get(name) ?? null;
  };

  const plan = buildDemoPlan(options.today, options.now, options.days ?? 45);
  for (const entry of plan) {
    const photoIds: string[] = [];
    const photo = entry.photo ? loadPhoto(entry.photo) : null;
    if (photo) {
      const row = savePhoto(ctx.db, ctx.config.dataDir, userId, {
        full: photo.full,
        fullMime: 'image/jpeg',
        thumb: photo.thumb,
        thumbMime: photo.thumb ? 'image/jpeg' : null,
        width: 1200,
        height: 900,
      });
      photoIds.push(row.id);
    }
    const { photo: _photo, ...input } = entry;
    createEntry(ctx.db, ctx.config.dataDir, userId, { ...input, photoIds });
  }
  return plan.length;
}
