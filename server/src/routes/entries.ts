import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { currentUser, requireAuth } from '../auth/middleware';
import { notFound, parse } from '../lib/http';
import { addDays, isValidDate, isValidTime, nowInTimeZone } from '../../../shared/dates';
import {
  createEntry,
  deleteEntry,
  entryInputSchema,
  getEntry,
  listEntries,
  listQuerySchema,
  updateEntry,
} from '../services/entries';
import { calendarSummary, computeStats, entryDateBounds, foodOptions, suggestions } from '../services/insights';

const idSchema = z.uuid('Identificador no válido.');

const rangeSchema = z
  .object({
    from: z.string().refine(isValidDate, 'Fecha inicial no válida.'),
    to: z.string().refine(isValidDate, 'Fecha final no válida.'),
  })
  .refine((r) => r.from <= r.to, 'La fecha inicial debe ser anterior a la final.')
  .refine((r) => r.to <= addDays(r.from, 3700), 'El periodo es demasiado largo.');

export function entryRoutes(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/entries', (req, res) => {
    const user = currentUser(req);
    res.json(listEntries(ctx.db, user.id, parse(listQuerySchema, req.query)));
  });

  router.get('/entries/:id', (req, res) => {
    const user = currentUser(req);
    const entry = getEntry(ctx.db, user.id, parse(idSchema, req.params.id));
    if (!entry) throw notFound('El registro');
    res.json({ entry });
  });

  router.post('/entries', (req, res) => {
    const user = currentUser(req);
    const entry = createEntry(ctx.db, ctx.config.dataDir, user.id, parse(entryInputSchema, req.body));
    res.status(201).json({ entry });
  });

  router.put('/entries/:id', (req, res) => {
    const user = currentUser(req);
    const entry = updateEntry(ctx.db, ctx.config.dataDir, user.id, parse(idSchema, req.params.id), parse(entryInputSchema, req.body));
    if (!entry) throw notFound('El registro');
    res.json({ entry });
  });

  router.delete('/entries/:id', (req, res) => {
    const user = currentUser(req);
    if (!deleteEntry(ctx.db, ctx.config.dataDir, user.id, parse(idSchema, req.params.id))) throw notFound('El registro');
    res.json({ ok: true });
  });

  router.get('/calendar', (req, res) => {
    const user = currentUser(req);
    const range = parse(rangeSchema, req.query);
    res.json(calendarSummary(ctx.db, user.id, range.from, range.to));
  });

  router.get('/suggestions', (req, res) => {
    const user = currentUser(req);
    const time = typeof req.query.time === 'string' && isValidTime(req.query.time) ? req.query.time : undefined;
    res.json(suggestions(ctx.db, user.id, time, nowInTimeZone(user.timezone).date));
  });

  router.get('/foods', (req, res) => {
    const user = currentUser(req);
    res.json({ foods: foodOptions(ctx.db, user.id) });
  });

  router.get('/stats', (req, res) => {
    const user = currentUser(req);
    const today = nowInTimeZone(user.timezone).date;
    let from = typeof req.query.from === 'string' ? req.query.from : '';
    let to = typeof req.query.to === 'string' ? req.query.to : '';
    if (!from) from = entryDateBounds(ctx.db, user.id).min ?? today;
    if (!to) to = today;
    if (from > to) from = to;
    const range = parse(rangeSchema, { from, to });
    res.json(computeStats(ctx.db, user.id, range.from, range.to));
  });

  return router;
}
