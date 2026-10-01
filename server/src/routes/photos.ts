import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { AppContext } from '../context';
import { currentUser, requireAuth } from '../auth/middleware';
import { HttpError, notFound, parse } from '../lib/http';
import { rateLimit } from '../security';
import { LIMITS } from '../../../shared/constants';
import { detectImageMime, getPhoto, photoFilePath, photoToDto, removePhotoFiles, savePhoto } from '../services/photos';

const dimensionSchema = z.coerce.number().int().min(1).max(20000).optional();

export function photoRoutes(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: LIMITS.photoBytes, files: 2, fields: 4 },
  }).fields([
    { name: 'photo', maxCount: 1 },
    { name: 'thumb', maxCount: 1 },
  ]);

  router.post(
    '/photos',
    rateLimit({ windowMs: 60_000, max: 40, key: (req) => `upload:${req.user?.id}` }),
    (req, res, next) => {
      upload(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          next(new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'La foto es demasiado grande (máximo 12 MB).' : 'No se pudo subir la foto.'));
          return;
        }
        next(err as Error | undefined);
      });
    },
    (req, res) => {
      const user = currentUser(req);
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const photo = files?.photo?.[0];
      if (!photo) throw new HttpError(400, 'No se ha recibido ninguna foto.');
      const fullMime = detectImageMime(photo.buffer);
      if (!fullMime) throw new HttpError(400, 'El archivo no es una imagen compatible (JPEG, PNG o WebP).');
      const thumb = files?.thumb?.[0];
      const thumbMime = thumb ? detectImageMime(thumb.buffer) : null;
      const row = savePhoto(ctx.db, ctx.config.dataDir, user.id, {
        full: photo.buffer,
        fullMime,
        thumb: thumbMime ? thumb!.buffer : undefined,
        thumbMime,
        width: parse(dimensionSchema, req.body?.width),
        height: parse(dimensionSchema, req.body?.height),
      });
      res.status(201).json({ photo: photoToDto(row) });
    },
  );

  router.get('/photos/:id', (req, res) => {
    const user = currentUser(req);
    const id = parse(z.uuid(), req.params.id);
    const row = getPhoto(ctx.db, user.id, id);
    if (!row) throw notFound('La foto');
    const variant = req.query.size === 'thumb' && row.thumb_mime ? 'thumb' : 'full';
    const file = photoFilePath(ctx.config.dataDir, row, variant);
    if (!fs.existsSync(file)) throw notFound('La foto');
    res.setHeader('Content-Type', variant === 'thumb' ? row.thumb_mime! : row.mime);
    // Privada: solo la caché del propio navegador puede guardarla.
    res.setHeader('Cache-Control', 'private, max-age=604800, immutable');
    fs.createReadStream(file).pipe(res);
  });

  router.delete('/photos/:id', (req, res) => {
    const user = currentUser(req);
    const row = getPhoto(ctx.db, user.id, parse(z.uuid(), req.params.id));
    if (!row) throw notFound('La foto');
    // Las fotos ya guardadas en un registro se quitan editando el registro.
    if (row.entry_id) throw new HttpError(409, 'Esta foto forma parte de un registro. Quítala desde el registro.');
    ctx.db.prepare('DELETE FROM photos WHERE id = ? AND user_id = ?').run(row.id, user.id);
    removePhotoFiles(ctx.config.dataDir, [row]);
    res.json({ ok: true });
  });

  return router;
}
