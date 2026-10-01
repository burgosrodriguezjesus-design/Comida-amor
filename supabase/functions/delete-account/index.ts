// Borrado definitivo: todos los registros y fotos, o la cuenta entera.
// Exige la sesión de la persona y vuelve a comprobar su contraseña.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

async function removeAllPhotos(userId: string) {
  for (;;) {
    const { data, error } = await admin.storage.from('photos').list(userId, { limit: 1000 });
    if (error) throw error;
    if (!data || data.length === 0) return;
    const { error: removeError } = await admin.storage.from('photos').remove(data.map((f) => `${userId}/${f.name}`));
    if (removeError) throw removeError;
    if (data.length < 1000) return;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user?.email) return json({ error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' }, 401);

  let body: { mode?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Datos no válidos.' }, 400);
  }
  const mode = body.mode === 'account' ? 'account' : 'entries';
  const password = typeof body.password === 'string' ? body.password : '';
  const check = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: passwordError } = await check.auth.signInWithPassword({ email: user.email, password });
  if (passwordError) return json({ error: 'La contraseña no es correcta.' }, 403);
  // Solo se descarta esta comprobación (sin cerrar las demás sesiones).
  await check.auth.signOut({ scope: 'local' }).catch(() => undefined);

  try {
    await removeAllPhotos(user.id);
    if (mode === 'account') {
      const { error } = await admin.auth.admin.deleteUser(user.id); // borra en cascada todas sus filas
      if (error) throw error;
    } else {
      const { count } = await admin.from('entries').delete({ count: 'exact' }).eq('user_id', user.id);
      await admin.from('photos').delete().eq('user_id', user.id);
      return json({ ok: true, deleted: count ?? 0 });
    }
  } catch (error) {
    console.error('delete-account', (error as Error).message);
    return json({ error: 'No se pudo completar el borrado. Inténtalo de nuevo.' }, 500);
  }
  return json({ ok: true });
});
