/* eslint-disable @typescript-eslint/no-explicit-any */
// «API» de la app publicada: responde a las mismas rutas que el servidor propio,
// pero los datos viven en Supabase (Postgres con seguridad por filas, fotos en un
// almacén privado y funciones para el alta, el borrado y los recordatorios).
// Las consultas (búsqueda, calendario, estadísticas) se calculan en el dispositivo
// con shared/queries.ts, las mismas que se comprueban contra el servidor.

import { LIMITS, MEAL_TYPE_IDS, type MealType } from '@shared/constants';
import { addDays, isValidDate, isValidTime, localDateTimeParts } from '@shared/dates';
import { calendarFromEntries, foodOptionsFromEntries, queryEntries, statsFromEntries, suggestionsFromEntries } from '@shared/queries';
import type { Entry, EntryPhoto, ReminderSettings, ReminderTime, User } from '@shared/types';
import { ApiError } from '@/api/client';
import { DEFAULT_REMINDERS, localRequest, validateEntry, type StoredEntry } from '@/local/localApi';
import { getSupabase, type SupabaseLike } from './client';

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || null;

interface PhotoUrl extends EntryPhoto {
  expires: number;
}

interface State {
  userId: string;
  email: string;
  profile: { name: string; timezone: string; createdAt: string };
  entries: Map<string, StoredEntry>;
  loadedAt: number;
  photos: Map<string, PhotoUrl>;
}

let state: State | null = null;
let demoActive = false;

const nowIso = () => new Date().toISOString();

// ---------- Utilidades ----------

function fail(error: unknown, fallback = 'No se pudo guardar. Comprueba tu conexión e inténtalo de nuevo.'): never {
  if (error instanceof ApiError) throw error;
  const message = String((error as { message?: string })?.message ?? '');
  if (/Failed to fetch|NetworkError|network/i.test(message)) {
    throw new ApiError('No hay conexión. Revisa tu internet e inténtalo de nuevo.', 0, 'offline');
  }
  if (/JWT|session|token/i.test(message)) throw new ApiError('Tu sesión ha caducado. Vuelve a iniciar sesión.', 401, 'unauthenticated');
  console.warn('[supabase]', error);
  throw new ApiError(fallback, 503);
}

async function check<T>(promise: PromiseLike<{ data: T; error: any }>, fallback?: string): Promise<T> {
  let result: { data: T; error: any };
  try {
    result = await promise;
  } catch (error) {
    fail(error, fallback);
  }
  if (result.error) fail(result.error, fallback);
  return result.data;
}

/** Mensaje de error de una función de Supabase (viene en el JSON de la respuesta). */
async function functionError(error: any, fallback: string): Promise<ApiError> {
  const status = error?.context?.status ?? 500;
  try {
    const body = await error.context.json();
    if (body?.error) return new ApiError(body.error, status);
  } catch {
    /* sin cuerpo legible */
  }
  if (/Failed to fetch|NetworkError/i.test(String(error?.message))) {
    return new ApiError('No hay conexión. Revisa tu internet e inténtalo de nuevo.', 0, 'offline');
  }
  return new ApiError(fallback, status);
}

function rowToEntry(row: any): StoredEntry {
  return {
    id: row.id,
    eatenAt: row.eaten_at,
    mealType: row.meal_type,
    items: Array.isArray(row.items) ? row.items : [],
    notes: row.notes ?? '',
    feelingNote: row.feeling_note ?? '',
    symptoms: row.symptoms ?? [],
    otherSymptoms: row.other_symptoms ?? '',
    photoIds: row.photo_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function entryToRow(entry: Omit<StoredEntry, 'id' | 'createdAt' | 'updatedAt'>) {
  return {
    eaten_at: entry.eatenAt,
    meal_type: entry.mealType,
    items: entry.items,
    notes: entry.notes,
    feeling_note: entry.feelingNote,
    symptoms: entry.symptoms,
    other_symptoms: entry.otherSymptoms,
    photo_ids: entry.photoIds,
  };
}

function userDto(s: State): User {
  return { id: s.userId, name: s.profile.name, email: s.email, isDemo: false, timezone: s.profile.timezone, createdAt: s.profile.createdAt };
}

const photoPath = (userId: string, id: string, thumb = false) => `${userId}/${id}${thumb ? '_thumb' : ''}.jpg`;

// ---------- Sesión y carga ----------

async function loadState(sb: SupabaseLike, force = false): Promise<State> {
  const { data } = await sb.auth.getSession();
  const session = data?.session;
  if (!session) {
    state = null;
    throw new ApiError('Tu sesión ha caducado. Vuelve a iniciar sesión.', 401, 'unauthenticated');
  }
  if (state && state.userId === session.user.id && !force && Date.now() - state.loadedAt < 60_000) return state;

  const profile = await check<any>(sb.from('profiles').select('name, timezone, created_at').eq('id', session.user.id).maybeSingle(), 'No se pudieron cargar tus datos.');
  const entries = new Map<string, StoredEntry>();
  for (let from = 0; ; from += 1000) {
    const rows = await check<any[]>(
      sb.from('entries').select('*').order('eaten_at', { ascending: true }).range(from, from + 999),
      'No se pudieron cargar tus registros.',
    );
    for (const row of rows ?? []) entries.set(row.id, rowToEntry(row));
    if (!rows || rows.length < 1000) break;
  }
  const previousPhotos = state && state.userId === session.user.id ? state.photos : new Map<string, PhotoUrl>();
  state = {
    userId: session.user.id,
    email: session.user.email ?? '',
    profile: {
      name: profile?.name ?? session.user.user_metadata?.name ?? 'Yo',
      timezone: profile?.timezone ?? 'Europe/Madrid',
      createdAt: profile?.created_at ?? nowIso(),
    },
    entries,
    loadedAt: Date.now(),
    photos: previousPhotos,
  };
  return state;
}

/** Enlaces temporales (1 h) a las fotos privadas que se van a mostrar. */
async function hydrate(sb: SupabaseLike, s: State, list: StoredEntry[]): Promise<Entry[]> {
  const soon = Date.now() + 5 * 60_000;
  const missing = [...new Set(list.flatMap((e) => e.photoIds))].filter((id) => !s.photos.has(id) || s.photos.get(id)!.expires < soon);
  for (let i = 0; i < missing.length; i += 100) {
    const ids = missing.slice(i, i + 100);
    try {
      const [signed, meta] = await Promise.all([
        check<any[]>(sb.storage.from('photos').createSignedUrls(ids.flatMap((id) => [photoPath(s.userId, id), photoPath(s.userId, id, true)]), 3600)),
        check<any[]>(sb.from('photos').select('id, width, height').in('id', ids)),
      ]);
      const urls = new Map((signed ?? []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl as string]));
      const dims = new Map((meta ?? []).map((m) => [m.id, m]));
      for (const id of ids) {
        const url = urls.get(photoPath(s.userId, id));
        if (!url) continue;
        s.photos.set(id, {
          id,
          url,
          thumbUrl: urls.get(photoPath(s.userId, id, true)) ?? url,
          width: dims.get(id)?.width ?? null,
          height: dims.get(id)?.height ?? null,
          expires: Date.now() + 3600_000,
        });
      }
    } catch {
      /* si las fotos no cargan, el registro se muestra igualmente */
    }
  }
  return list.map(({ photoIds, ...entry }) => ({
    ...entry,
    photos: photoIds.filter((id) => s.photos.has(id)).map((id) => {
      const { expires: _e, ...photo } = s.photos.get(id)!;
      return photo;
    }),
  }));
}

function plainEntries(s: State): Entry[] {
  return [...s.entries.values()].map(({ photoIds, ...entry }) => ({
    ...entry,
    photos: photoIds.map((id) => ({ id, url: '', thumbUrl: '', width: null, height: null })),
  }));
}

async function removePhotos(sb: SupabaseLike, s: State, ids: string[]) {
  if (!ids.length) return;
  for (const id of ids) s.photos.delete(id);
  await sb.storage.from('photos').remove(ids.flatMap((id) => [photoPath(s.userId, id), photoPath(s.userId, id, true)])).catch(() => undefined);
  await Promise.resolve(sb.from('photos').delete().in('id', ids)).catch(() => undefined);
}

// ---------- Rutas ----------

export async function supabaseRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  const u = new URL(url, 'http://app');
  if (demoActive) {
    if (u.pathname === '/api/auth/logout') demoActive = false;
    return localRequest<T>(method, url, body);
  }
  const sb = await getSupabase();
  return (await route(sb, method, u.pathname, u.searchParams, body)) as T;
}

async function route(sb: SupabaseLike, method: string, path: string, params: URLSearchParams, body: any): Promise<unknown> {
  const today = localDateTimeParts(new Date()).date;

  // ----- Acceso -----
  if (path === '/api/auth/options') return { demoEnabled: true, registrationEnabled: true };
  if (path === '/api/auth/demo') {
    demoActive = true;
    return localRequest('POST', '/api/auth/demo');
  }
  if (path === '/api/auth/register') {
    const { error } = await sb.functions.invoke('signup', {
      body: { name: body?.name, email: body?.email, password: body?.password, timezone: body?.timezone },
    });
    if (error) throw await functionError(error, 'No se pudo crear la cuenta. Inténtalo de nuevo.');
    return login(sb, String(body?.email ?? ''), String(body?.password ?? ''));
  }
  if (path === '/api/auth/login') return login(sb, String(body?.email ?? ''), String(body?.password ?? ''));
  if (path === '/api/auth/logout') {
    state = null;
    await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return { ok: true };
  }
  if (path === '/api/auth/me') return { user: userDto(await loadState(sb)) };

  const s = await loadState(sb);

  // ----- Cuenta -----
  if (path === '/api/account' && method === 'PATCH') {
    const patch: Record<string, string> = {};
    if (typeof body?.name === 'string') {
      const name = body.name.trim().slice(0, 60);
      if (!name) throw new ApiError('Escribe tu nombre.', 400);
      patch.name = name;
    }
    if (typeof body?.timezone === 'string' && body.timezone.length <= 64) patch.timezone = body.timezone;
    if (Object.keys(patch).length) {
      await check(sb.from('profiles').update({ ...patch, updated_at: nowIso() }).eq('id', s.userId));
      s.profile = { ...s.profile, ...patch };
    }
    return { user: userDto(s) };
  }
  if (path === '/api/account/password') {
    const current = String(body?.currentPassword ?? '');
    const next = String(body?.newPassword ?? '');
    if (next.length < 8) throw new ApiError('La nueva contraseña debe tener al menos 8 caracteres.', 400);
    const { error: wrong } = await sb.auth.signInWithPassword({ email: s.email, password: current });
    if (wrong) throw new ApiError('La contraseña no es correcta.', 403);
    const { error } = await sb.auth.updateUser({ password: next });
    if (error) throw new ApiError(/same|different/i.test(error.message) ? 'La nueva contraseña debe ser distinta de la actual.' : 'No se pudo cambiar la contraseña.', 400);
    await sb.auth.signOut({ scope: 'others' }).catch(() => undefined);
    return { ok: true };
  }
  if (path === '/api/account/logout-all') {
    state = null;
    await sb.auth.signOut({ scope: 'global' }).catch(() => undefined);
    return { ok: true };
  }
  if (path === '/api/account/export') {
    const all = await hydrate(sb, s, [...s.entries.values()].sort((a, b) => a.eatenAt.localeCompare(b.eatenAt)));
    const reminders = await getReminders(sb, s);
    return {
      exportedAt: nowIso(),
      app: 'Comida Amor',
      user: userDto(s),
      reminders: { enabled: reminders.enabled, quietMinutes: reminders.quietMinutes, times: reminders.times },
      entries: all.map((e) => ({ ...e, photos: e.photos.map((p) => ({ id: p.id, width: p.width, height: p.height })) })),
    };
  }
  if (path === '/api/account/delete-entries' || path === '/api/account/delete') {
    const mode = path === '/api/account/delete' ? 'account' : 'entries';
    const { data, error } = await sb.functions.invoke('delete-account', { body: { mode, password: body?.password ?? '' } });
    if (error) throw await functionError(error, 'No se pudo completar el borrado. Inténtalo de nuevo.');
    if (mode === 'account') {
      state = null;
      await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
    } else {
      s.entries.clear();
      s.photos.clear();
    }
    return { ok: true, deleted: (data as { deleted?: number } | null)?.deleted ?? 0 };
  }

  // ----- Registros -----
  if (path === '/api/entries' && method === 'GET') {
    const from = params.get('from') ?? undefined;
    const to = params.get('to') ?? undefined;
    if ((from && !isValidDate(from)) || (to && !isValidDate(to))) throw new ApiError('Fecha no válida.', 400);
    const result = queryEntries(plainEntries(s), {
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
    const ids = new Set(result.entries.map((e) => e.id));
    const full = new Map((await hydrate(sb, s, [...s.entries.values()].filter((e) => ids.has(e.id)))).map((e) => [e.id, e]));
    return { ...result, entries: result.entries.map((e) => full.get(e.id)!) };
  }
  if (path === '/api/entries' && method === 'POST') {
    const data = validateEntry(body);
    const row = await check<any>(sb.from('entries').insert(entryToRow(data)).select('*').single());
    const entry = rowToEntry(row);
    s.entries.set(entry.id, entry);
    return { entry: (await hydrate(sb, s, [entry]))[0] };
  }
  const entryMatch = /^\/api\/entries\/([^/]+)$/.exec(path);
  if (entryMatch) {
    const id = entryMatch[1];
    const current = s.entries.get(id);
    if (!current) throw new ApiError('El registro no existe.', 404);
    if (method === 'GET') return { entry: (await hydrate(sb, s, [current]))[0] };
    if (method === 'PUT') {
      const data = validateEntry(body);
      const row = await check<any>(sb.from('entries').update({ ...entryToRow(data), updated_at: nowIso() }).eq('id', id).select('*').single());
      const updated = rowToEntry(row);
      s.entries.set(id, updated);
      await removePhotos(sb, s, current.photoIds.filter((p) => !updated.photoIds.includes(p)));
      return { entry: (await hydrate(sb, s, [updated]))[0] };
    }
    if (method === 'DELETE') {
      await check(sb.from('entries').delete().eq('id', id));
      s.entries.delete(id);
      await removePhotos(sb, s, current.photoIds);
      return { ok: true };
    }
  }

  // ----- Consultas -----
  if (path === '/api/calendar') return calendarFromEntries(plainEntries(s), params.get('from') ?? today, params.get('to') ?? today);
  if (path === '/api/suggestions') {
    const time = params.get('time') ?? undefined;
    return suggestionsFromEntries(plainEntries(s), time && isValidTime(time) ? time : undefined, today);
  }
  if (path === '/api/foods') return { foods: foodOptionsFromEntries(plainEntries(s)) };
  if (path === '/api/stats') {
    const all = plainEntries(s);
    let from = params.get('from') || all.map((e) => e.eatenAt.slice(0, 10)).sort()[0] || today;
    const to = params.get('to') || today;
    if (from > to) from = to;
    if (from < addDays(to, -3700)) from = addDays(to, -3700);
    return statsFromEntries(all, from, to);
  }

  // ----- Fotos -----
  if (path === '/api/photos' && method === 'POST') {
    const form = body as FormData;
    const photo = form.get('photo');
    const thumb = form.get('thumb');
    if (!(photo instanceof Blob)) throw new ApiError('No se ha recibido ninguna foto.', 400);
    if (photo.size > LIMITS.photoBytes) throw new ApiError('La foto es demasiado grande (máximo 12 MB).', 400);
    const width = Number(form.get('width')) || null;
    const height = Number(form.get('height')) || null;
    const id = crypto.randomUUID();
    const bucket = sb.storage.from('photos');
    await check(bucket.upload(photoPath(s.userId, id), photo, { contentType: 'image/jpeg', upsert: false }), 'No se pudo subir la foto. Inténtalo de nuevo.');
    if (thumb instanceof Blob) {
      await check(bucket.upload(photoPath(s.userId, id, true), thumb, { contentType: 'image/jpeg', upsert: false }), 'No se pudo subir la foto.');
    }
    await check(sb.from('photos').insert({ id, width, height }), 'No se pudo guardar la foto.');
    const hydrated = await hydrate(sb, s, [{ id: 'tmp', eatenAt: '', mealType: 'otro', items: [], notes: '', feelingNote: '', symptoms: [], otherSymptoms: '', photoIds: [id], createdAt: '', updatedAt: '' }]);
    const dto = hydrated[0].photos[0];
    if (!dto) throw new ApiError('No se pudo preparar la foto. Inténtalo de nuevo.', 503);
    return { photo: dto };
  }
  const photoMatch = /^\/api\/photos\/([^/]+)$/.exec(path);
  if (photoMatch && method === 'DELETE') {
    const id = photoMatch[1];
    if ([...s.entries.values()].some((e) => e.photoIds.includes(id))) {
      throw new ApiError('Esta foto forma parte de un registro. Quítala desde el registro.', 409);
    }
    await removePhotos(sb, s, [id]);
    return { ok: true };
  }

  // ----- Recordatorios -----
  if (path === '/api/reminders' && method === 'GET') return getReminders(sb, s);
  if (path === '/api/reminders' && method === 'PUT') {
    const times = (Array.isArray(body?.times) ? body.times : [])
      .filter((t: ReminderTime) => t && isValidTime(t.time))
      .slice(0, LIMITS.remindersPerUser)
      .map((t: ReminderTime) => ({ id: String(t.id || crypto.randomUUID()).slice(0, 40), time: t.time, enabled: Boolean(t.enabled) }))
      .sort((a: ReminderTime, b: ReminderTime) => a.time.localeCompare(b.time));
    await check(
      sb.from('reminder_settings').upsert({
        user_id: s.userId,
        enabled: Boolean(body?.enabled),
        quiet_minutes: Math.max(0, Math.min(240, Number(body?.quietMinutes) || 0)),
        times,
        updated_at: nowIso(),
      }),
    );
    return getReminders(sb, s);
  }
  if (path === '/api/push/subscribe') {
    const keys = body?.keys ?? {};
    if (typeof body?.endpoint !== 'string' || !body.endpoint.startsWith('https://')) throw new ApiError('Suscripción no válida.', 400);
    await check(sb.rpc('register_push_subscription', { p_endpoint: body.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth }));
    return getReminders(sb, s);
  }
  if (path === '/api/push/unsubscribe') {
    await check(sb.from('push_subscriptions').delete().eq('endpoint', String(body?.endpoint ?? '')));
    return getReminders(sb, s);
  }
  if (path === '/api/push/test') {
    const { data, error } = await sb.functions.invoke('send-reminders', { body: { test: true } });
    if (error) throw await functionError(error, 'No se pudo enviar la notificación de prueba.');
    return data;
  }

  throw new ApiError('Ruta no encontrada.', 404);
}

async function login(sb: SupabaseLike, email: string, password: string) {
  if (!email.trim() || !password) throw new ApiError('Escribe tu correo y tu contraseña.', 400);
  const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) {
    if (/fetch|network/i.test(error.message)) throw new ApiError('No hay conexión. Revisa tu internet e inténtalo de nuevo.', 0);
    if (/rate|too many/i.test(error.message)) throw new ApiError('Demasiados intentos. Espera unos minutos y vuelve a intentarlo.', 429);
    throw new ApiError('El correo o la contraseña no son correctos.', 401, 'invalid_credentials');
  }
  return { user: userDto(await loadState(sb, true)) };
}

async function getReminders(sb: SupabaseLike, s: State): Promise<ReminderSettings> {
  const [row, count] = await Promise.all([
    check<any>(sb.from('reminder_settings').select('enabled, quiet_minutes, times').eq('user_id', s.userId).maybeSingle()),
    sb.from('push_subscriptions').select('id', { count: 'exact', head: true }),
  ]);
  return {
    enabled: row?.enabled ?? false,
    quietMinutes: row?.quiet_minutes ?? 60,
    times: (row?.times as ReminderTime[] | undefined) ?? DEFAULT_REMINDERS,
    pushConfigured: Boolean(VAPID_PUBLIC_KEY),
    publicKey: VAPID_PUBLIC_KEY,
    subscriptions: (count as { count?: number })?.count ?? 0,
  };
}
