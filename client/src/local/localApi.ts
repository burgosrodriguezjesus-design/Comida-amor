/* eslint-disable @typescript-eslint/no-explicit-any */
// API local: responde a las mismas rutas que el servidor, pero con los datos
// guardados en el almacenamiento privado de esta persona. Así la interfaz es
// exactamente la misma en la app completa y en la versión de prueba.

import { LIMITS, MEAL_TYPE_IDS, SYMPTOM_IDS, normalizeSymptoms, type MealType, type SymptomCode } from '@shared/constants';
import { addDays, isValidDate, isValidDateTime, isValidTime, localDateTimeParts } from '@shared/dates';
import { buildDemoPlan } from '@shared/demoPlan';
import {
  calendarFromEntries,
  foodOptionsFromEntries,
  queryEntries,
  statsFromEntries,
  suggestionsFromEntries,
} from '@shared/queries';
import { capitalizeFirst } from '@shared/text';
import type { Entry, EntryInput, EntryPhoto, ReminderSettings, ReminderTime, User } from '@shared/types';
import { ApiError } from '@/api/client';
import { createDbBackend, createIdbBackend, createMemoryBackend, serialWriter, type Backend, type Doc, type PhotoDoc } from './storage';
import { useCapability, viewerId } from './platform';

/** Registro tal y como se guarda (las fotos van aparte, por id). */
export type StoredEntry = Omit<Entry, 'photos'> & { photoIds: string[] };

interface Profile extends Doc {
  name: string;
  createdAt: string;
  timezone: string;
}

export const DEFAULT_REMINDERS: ReminderTime[] = [
  { id: 'desayuno', time: '09:30', enabled: true },
  { id: 'comida', time: '15:00', enabled: true },
  { id: 'cena', time: '21:45', enabled: true },
];

interface State {
  backend: Backend;
  profile: Profile | null;
  reminders: { enabled: boolean; quietMinutes: number; times: ReminderTime[] };
  entries: Map<string, StoredEntry>;
  photoCache: Map<string, PhotoDoc>;
  demo: boolean;
  write: (key: string, data: Doc | null) => Promise<void>;
}

let persistent: State | null = null;
let demo: State | null = null;
let loading: Promise<State> | null = null;

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);
const nowIso = () => new Date().toISOString();

/** Los registros se agrupan en documentos de 10 días (pocos documentos y todos pequeños). */
function bucketKey(eatenAt: string): string {
  const day = Number(eatenAt.slice(8, 10));
  return `r_${eatenAt.slice(0, 7)}-${day <= 10 ? 1 : day <= 20 ? 2 : 3}`;
}

function makeState(backend: Backend, docs: Map<string, Doc>, isDemo = false): State {
  const entries = new Map<string, StoredEntry>();
  for (const [key, doc] of docs) {
    if (!key.startsWith('r_')) continue;
    for (const entry of (doc.entries as StoredEntry[] | undefined) ?? []) entries.set(entry.id, entry);
  }
  const reminders = docs.get('reminders') as State['reminders'] | undefined;
  const writer = serialWriter((key, data) => (data ? backend.setMain(key, data) : backend.deleteMain(key)));
  return {
    backend,
    profile: (docs.get('profile') as Profile | undefined) ?? null,
    reminders: reminders ?? { enabled: false, quietMinutes: 60, times: DEFAULT_REMINDERS },
    entries,
    photoCache: new Map(),
    demo: isDemo,
    write: writer,
  };
}

/** Elige dónde guardar: primero el espacio privado en claude.ai, si no IndexedDB, si no memoria. */
async function loadPersistent(): Promise<State> {
  const [db, uid] = await Promise.all([useCapability('db'), viewerId()]);
  if (db && uid) {
    try {
      const backend = createDbBackend(db, uid);
      const docs = await backend.loadMain();
      if (docs.has('profile') || !(await idbHasProfile())) return makeState(backend, docs);
    } catch {
      /* se prueba con el navegador */
    }
  }
  const idb = await createIdbBackend();
  if (idb) {
    try {
      return makeState(idb, await idb.loadMain());
    } catch {
      /* sin IndexedDB utilizable */
    }
  }
  return makeState(createMemoryBackend(), new Map());
}

async function idbHasProfile(): Promise<boolean> {
  const idb = await createIdbBackend();
  if (!idb) return false;
  try {
    return (await idb.loadMain()).has('profile');
  } catch {
    return false;
  }
}

async function getState(): Promise<State> {
  if (demo) return demo;
  if (persistent) return persistent;
  loading ??= loadPersistent().then((s) => (persistent = s));
  return loading;
}

export async function storageKind(): Promise<Backend['kind'] | 'demo'> {
  const s = await getState();
  return s.demo ? 'demo' : s.backend.kind;
}

// ---------- Escritura ----------

async function persistBucket(state: State, key: string) {
  const list = [...state.entries.values()].filter((e) => bucketKey(e.eatenAt) === key).sort((a, b) => a.eatenAt.localeCompare(b.eatenAt));
  await state.write(key, list.length ? { entries: list } : null);
}

async function saveOrFail(task: Promise<void>, rollback: () => void) {
  try {
    await task;
  } catch (error) {
    rollback();
    const code = (error as { code?: string }).code;
    if (code === 'quota_exceeded') throw new ApiError('Se ha llenado el espacio disponible. Borra registros antiguos o fotos para seguir.', 507);
    throw new ApiError('No se pudo guardar. Comprueba tu conexión e inténtalo de nuevo.', 503);
  }
}

// ---------- Fotos ----------

/** Reduce una imagen hasta que quepa en el límite de tamaño de un documento. */
async function shrink(blob: Blob, maxSide: number, maxChars: number): Promise<{ url: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  let side = Math.min(maxSide, Math.max(bitmap.width, bitmap.height));
  let quality = 0.8;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const scale = side / Math.max(bitmap.width, bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= maxChars) {
      bitmap.close();
      return { url, width, height };
    }
    side = Math.round(side * 0.8);
    quality = Math.max(0.55, quality - 0.06);
  }
  bitmap.close();
  throw new ApiError('No se pudo reducir la foto lo suficiente. Prueba con otra.', 400);
}

function photoDto(id: string, doc: PhotoDoc): EntryPhoto {
  return { id, url: doc.full, thumbUrl: doc.thumb, width: doc.width, height: doc.height };
}

async function hydrate(state: State, list: StoredEntry[]): Promise<Entry[]> {
  const missing = [...new Set(list.flatMap((e) => e.photoIds))].filter((id) => !state.photoCache.has(id));
  for (let i = 0; i < missing.length; i += 6) {
    await Promise.all(
      missing.slice(i, i + 6).map(async (id) => {
        try {
          const doc = await state.backend.getPhoto(id);
          if (doc) state.photoCache.set(id, doc);
        } catch {
          /* una foto que no carga no impide ver el registro */
        }
      }),
    );
  }
  return list.map(({ photoIds, ...entry }) => ({
    ...entry,
    photos: photoIds.filter((id) => state.photoCache.has(id)).map((id) => photoDto(id, state.photoCache.get(id)!)),
  }));
}

// ---------- Validación ----------

export function validateEntry(body: EntryInput): Omit<StoredEntry, 'id' | 'createdAt' | 'updatedAt'> {
  if (!body || typeof body !== 'object') throw new ApiError('Datos no válidos.', 400);
  if (!isValidDateTime(body.eatenAt)) throw new ApiError('La fecha u hora no es válida.', 400);
  if (!(MEAL_TYPE_IDS as string[]).includes(body.mealType)) throw new ApiError('Elige un tipo de comida.', 400);
  const items = (body.items ?? [])
    .map((i) => ({ name: capitalizeFirst(String(i.name ?? '').trim()).slice(0, LIMITS.itemName), quantity: String(i.quantity ?? '').trim().slice(0, LIMITS.quantity), kind: i.kind === 'drink' ? ('drink' as const) : ('food' as const) }))
    .filter((i) => i.name)
    .slice(0, LIMITS.itemsPerEntry);
  const notes = String(body.notes ?? '').trim().slice(0, LIMITS.notes);
  if (items.length === 0 && !notes) throw new ApiError('Escribe al menos un alimento o bebida.', 400);
  const otherSymptoms = String(body.otherSymptoms ?? '').trim().slice(0, LIMITS.otherSymptoms);
  const symptoms = normalizeSymptoms(((body.symptoms ?? []) as SymptomCode[]).filter((s) => (SYMPTOM_IDS as string[]).includes(s)), otherSymptoms);
  return {
    eatenAt: body.eatenAt,
    mealType: body.mealType as MealType,
    items,
    notes,
    feelingNote: String(body.feelingNote ?? '').trim().slice(0, LIMITS.notes),
    symptoms,
    otherSymptoms: symptoms.includes('otros') ? otherSymptoms : '',
    photoIds: [...new Set(body.photoIds ?? [])].slice(0, LIMITS.photosPerEntry),
  };
}

function userDto(state: State): User {
  return {
    id: 'local',
    name: state.profile?.name ?? '',
    email: '',
    isDemo: state.demo,
    timezone: state.profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    createdAt: state.profile?.createdAt ?? nowIso(),
  };
}

function requireProfile(state: State) {
  if (!state.profile) throw new ApiError('Empieza tu diario para continuar.', 401, 'unauthenticated');
}

// ---------- Demostración ----------

function startDemo() {
  const now = localDateTimeParts(new Date());
  const photos = new Map<string, PhotoDoc>();
  const docs = new Map<string, Doc>();
  const entries: StoredEntry[] = [];
  for (const plan of buildDemoPlan(now.date, now.time)) {
    const photoIds: string[] = [];
    if (plan.photo) {
      const id = uuid();
      photos.set(id, { full: `${import.meta.env.BASE_URL}demo/${plan.photo}.jpg`, thumb: `${import.meta.env.BASE_URL}demo/${plan.photo}_thumb.jpg`, width: 1200, height: 900, createdAt: nowIso() });
      photoIds.push(id);
    }
    const { photo: _photo, ...rest } = plan;
    entries.push({ ...rest, id: uuid(), photoIds, createdAt: nowIso(), updatedAt: nowIso() });
  }
  for (const entry of entries) {
    const key = bucketKey(entry.eatenAt);
    const doc = (docs.get(key) as { entries: StoredEntry[] } | undefined) ?? { entries: [] };
    doc.entries.push(entry);
    docs.set(key, doc);
  }
  docs.set('profile', { name: 'Lucía', createdAt: nowIso(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  demo = makeState(createMemoryBackend(photos), docs, true);
}

// ---------- Router ----------

function parseUrl(url: string) {
  const u = new URL(url, 'http://local');
  return { path: u.pathname, params: u.searchParams };
}

export async function localRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  const { path, params } = parseUrl(url);
  const state = await getState();
  const result = await route(state, method, path, params, body);
  return result as T;
}

async function route(state: State, method: string, path: string, params: URLSearchParams, body: any): Promise<unknown> {
  const today = localDateTimeParts(new Date()).date;

  // Acceso
  if (path === '/api/auth/options') return { demoEnabled: true, registrationEnabled: true };
  if (path === '/api/auth/me') {
    requireProfile(state);
    return { user: userDto(state) };
  }
  if (path === '/api/auth/demo') {
    startDemo();
    return { user: userDto(demo!) };
  }
  if (path === '/api/auth/logout') {
    demo = null;
    return { ok: true };
  }
  if (path === '/api/auth/register') {
    const name = String(body?.name ?? '').trim().slice(0, 60);
    if (!name) throw new ApiError('Escribe tu nombre.', 400);
    demo = null;
    const target = await getState();
    const profile: Profile = { name, createdAt: nowIso(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    try {
      await target.backend.setMain('profile', profile);
    } catch {
      // Si no se puede escribir en la cuenta (p. ej. acceso solo de lectura), se usa este navegador.
      const idb = await createIdbBackend();
      persistent = makeState(idb ?? createMemoryBackend(), new Map());
      await persistent.backend.setMain('profile', profile).catch(() => undefined);
      persistent.profile = profile;
      return { user: userDto(persistent) };
    }
    target.profile = profile;
    return { user: userDto(target) };
  }

  requireProfile(state);

  // Cuenta
  if (path === '/api/account' && method === 'PATCH') {
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : null;
    if (name !== null) {
      if (!name) throw new ApiError('Escribe tu nombre.', 400);
      const previous = state.profile!;
      state.profile = { ...previous, name };
      await saveOrFail(state.write('profile', state.profile), () => (state.profile = previous));
    }
    return { user: userDto(state) };
  }
  if (path === '/api/account/export') {
    const all = await hydrate(state, [...state.entries.values()].sort((a, b) => a.eatenAt.localeCompare(b.eatenAt)));
    return {
      exportedAt: nowIso(),
      app: 'Comida Amor',
      user: userDto(state),
      reminders: state.reminders,
      entries: all.map((e) => ({ ...e, photos: e.photos.map((p) => ({ id: p.id, width: p.width, height: p.height })) })),
    };
  }
  if (path === '/api/account/delete-entries' || path === '/api/account/delete') {
    const entries = [...state.entries.values()];
    const buckets = new Set(entries.map((e) => bucketKey(e.eatenAt)));
    state.entries.clear();
    await Promise.all([...buckets].map((key) => state.write(key, null).catch(() => undefined)));
    await Promise.all(entries.flatMap((e) => e.photoIds).map((id) => state.backend.deletePhoto(id).catch(() => undefined)));
    state.photoCache.clear();
    if (path === '/api/account/delete') {
      await state.write('reminders', null).catch(() => undefined);
      await state.write('profile', null).catch(() => undefined);
      state.profile = null;
      state.reminders = { enabled: false, quietMinutes: 60, times: DEFAULT_REMINDERS };
      if (state.demo) demo = null;
    }
    return { ok: true, deleted: entries.length };
  }

  // Registros
  if (path === '/api/entries' && method === 'GET') {
    const from = params.get('from') ?? undefined;
    const to = params.get('to') ?? undefined;
    if ((from && !isValidDate(from)) || (to && !isValidDate(to))) throw new ApiError('Fecha no válida.', 400);
    const result = queryEntries(await hydrateAll(state), {
      from,
      to,
      q: params.get('q') ?? undefined,
      types: (params.get('types')?.split(',').filter((t) => (MEAL_TYPE_IDS as string[]).includes(t)) ?? []) as MealType[],
      food: params.get('food') ?? undefined,
      symptoms: params.get('symptoms') === '1',
      photos: params.get('photos') === '1',
      order: params.get('order') === 'asc' ? 'asc' : 'desc',
      limit: Math.min(5000, Number(params.get('limit') ?? 50) || 50),
      offset: Number(params.get('offset') ?? 0) || 0,
    });
    // Las fotos solo se cargan para la página que se va a mostrar.
    const ids = new Set(result.entries.map((e) => e.id));
    const stored = [...state.entries.values()].filter((e) => ids.has(e.id));
    const full = new Map((await hydrate(state, stored)).map((e) => [e.id, e]));
    return { ...result, entries: result.entries.map((e) => full.get(e.id)!) };
  }
  const entryMatch = /^\/api\/entries\/([^/]+)$/.exec(path);
  if (path === '/api/entries' && method === 'POST') {
    const data = validateEntry(body);
    const entry: StoredEntry = { ...data, id: uuid(), createdAt: nowIso(), updatedAt: nowIso() };
    state.entries.set(entry.id, entry);
    await saveOrFail(persistBucket(state, bucketKey(entry.eatenAt)), () => state.entries.delete(entry.id));
    return { entry: (await hydrate(state, [entry]))[0] };
  }
  if (entryMatch) {
    const id = entryMatch[1];
    const current = state.entries.get(id);
    if (!current) throw new ApiError('El registro no existe.', 404);
    if (method === 'GET') return { entry: (await hydrate(state, [current]))[0] };
    if (method === 'PUT') {
      const data = validateEntry(body);
      const updated: StoredEntry = { ...current, ...data, updatedAt: nowIso() };
      state.entries.set(id, updated);
      const keys = new Set([bucketKey(current.eatenAt), bucketKey(updated.eatenAt)]);
      await saveOrFail(Promise.all([...keys].map((k) => persistBucket(state, k))).then(() => undefined), () => state.entries.set(id, current));
      for (const photoId of current.photoIds.filter((p) => !updated.photoIds.includes(p))) {
        state.photoCache.delete(photoId);
        void state.backend.deletePhoto(photoId).catch(() => undefined);
      }
      return { entry: (await hydrate(state, [updated]))[0] };
    }
    if (method === 'DELETE') {
      state.entries.delete(id);
      await saveOrFail(persistBucket(state, bucketKey(current.eatenAt)), () => state.entries.set(id, current));
      for (const photoId of current.photoIds) {
        state.photoCache.delete(photoId);
        void state.backend.deletePhoto(photoId).catch(() => undefined);
      }
      return { ok: true };
    }
  }

  // Consultas
  if (path === '/api/calendar') {
    const from = params.get('from') ?? today;
    const to = params.get('to') ?? today;
    return calendarFromEntries(await hydrateAll(state), from, to);
  }
  if (path === '/api/suggestions') {
    const time = params.get('time') ?? undefined;
    return suggestionsFromEntries(await hydrateAll(state), time && isValidTime(time) ? time : undefined, today);
  }
  if (path === '/api/foods') return { foods: foodOptionsFromEntries(await hydrateAll(state)) };
  if (path === '/api/stats') {
    const all = await hydrateAll(state);
    let from = params.get('from') || all.map((e) => e.eatenAt.slice(0, 10)).sort()[0] || today;
    const to = params.get('to') || today;
    if (from > to) from = to;
    if (from < addDays(to, -3700)) from = addDays(to, -3700);
    return statsFromEntries(all, from, to);
  }

  // Fotos
  if (path === '/api/photos' && method === 'POST') {
    const form = body as FormData;
    const photo = form.get('photo');
    const thumb = form.get('thumb');
    if (!(photo instanceof Blob)) throw new ApiError('No se ha recibido ninguna foto.', 400);
    const full = await shrink(photo, 1280, 190_000);
    const small = await shrink(thumb instanceof Blob ? thumb : photo, 360, 45_000);
    const id = uuid();
    const doc: PhotoDoc = { full: full.url, thumb: small.url, width: full.width, height: full.height, createdAt: nowIso() };
    try {
      await state.backend.setPhoto(id, doc);
    } catch {
      throw new ApiError('No se pudo guardar la foto. Inténtalo de nuevo.', 503);
    }
    state.photoCache.set(id, doc);
    return { photo: photoDto(id, doc) };
  }
  const photoMatch = /^\/api\/photos\/([^/]+)$/.exec(path);
  if (photoMatch && method === 'DELETE') {
    const id = photoMatch[1];
    const used = [...state.entries.values()].some((e) => e.photoIds.includes(id));
    if (used) throw new ApiError('Esta foto forma parte de un registro. Quítala desde el registro.', 409);
    state.photoCache.delete(id);
    await state.backend.deletePhoto(id).catch(() => undefined);
    return { ok: true };
  }

  // Recordatorios (en esta versión, avisos dentro de la app mientras está abierta)
  const reminderView = (): ReminderSettings => ({ ...state.reminders, pushConfigured: false, publicKey: null, subscriptions: 0 });
  if (path === '/api/reminders' && method === 'GET') return reminderView();
  if (path === '/api/reminders' && method === 'PUT') {
    const times = (Array.isArray(body?.times) ? body.times : [])
      .filter((t: ReminderTime) => t && isValidTime(t.time))
      .slice(0, LIMITS.remindersPerUser)
      .map((t: ReminderTime) => ({ id: String(t.id || uuid()).slice(0, 40), time: t.time, enabled: Boolean(t.enabled) }))
      .sort((a: ReminderTime, b: ReminderTime) => a.time.localeCompare(b.time));
    const previous = state.reminders;
    state.reminders = { enabled: Boolean(body?.enabled), quietMinutes: Math.max(0, Math.min(240, Number(body?.quietMinutes) || 0)), times };
    await saveOrFail(state.write('reminders', state.reminders), () => (state.reminders = previous));
    return reminderView();
  }
  if (path.startsWith('/api/push/')) throw new ApiError('Las notificaciones push no están disponibles en esta versión.', 409);

  throw new ApiError('Ruta no encontrada.', 404);
}

/** Registros sin fotos (para consultas que no las necesitan). */
async function hydrateAll(state: State): Promise<Entry[]> {
  return [...state.entries.values()].map(({ photoIds, ...entry }) => ({
    ...entry,
    // Marcadores para filtros «con foto»; las URL reales se cargan al mostrar.
    photos: photoIds.map((id) => ({ id, url: '', thumbUrl: '', width: null, height: null })),
  }));
}
