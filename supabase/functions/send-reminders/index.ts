// Recordatorios: pg_cron llama a esta función cada minuto (con un secreto propio) y
// envía «¿Has registrado lo que acabas de comer?» a quien le toque. Una persona con
// sesión también puede pedir una notificación de prueba para sus dispositivos.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface Config {
  vapid_public_key: string;
  vapid_private_key: string;
  vapid_subject: string;
  cron_secret: string;
}

let config: Config | null = null;
async function loadConfig(): Promise<Config> {
  if (config) return config;
  const { data, error } = await admin.rpc('push_config');
  if (error || !data) throw new Error('Sin configuración de notificaciones');
  config = data as Config;
  webpush.setVapidDetails(config.vapid_subject, config.vapid_public_key, config.vapid_private_key);
  return config;
}

const REMINDER = { title: 'Comida Amor', body: '¿Has registrado lo que acabas de comer?', url: '/?nuevo=rapido', tag: 'comida-amor-recordatorio' };

async function sendToUser(userId: string, payload: typeof REMINDER): Promise<number> {
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId);
  let delivered = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 1800, urgency: 'normal', topic: payload.tag.slice(0, 32) },
      );
      delivered += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      else console.warn('push', status ?? (error as Error).message);
    }
  }
  return delivered;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  let cfg: Config;
  try {
    cfg = await loadConfig();
  } catch (error) {
    console.error((error as Error).message);
    return json({ error: 'Las notificaciones no están configuradas.' }, 500);
  }

  // Llamada programada (pg_cron)
  if (req.headers.get('x-cron-secret')) {
    if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return json({ error: 'No autorizado.' }, 401);
    const { data: due, error } = await admin.rpc('due_reminders');
    if (error) return json({ error: error.message }, 500);
    let sent = 0;
    for (const row of (due ?? []) as { user_id: string; reminder_id: string; local_date: string; skip: boolean }[]) {
      const status = row.skip ? 'skipped' : (await sendToUser(row.user_id, REMINDER)) > 0 ? 'sent' : 'failed';
      if (status === 'sent') sent += 1;
      await admin
        .from('reminder_log')
        .update({ status })
        .eq('user_id', row.user_id)
        .eq('reminder_id', row.reminder_id)
        .eq('local_date', row.local_date);
    }
    return json({ ok: true, due: (due ?? []).length, sent });
  }

  // Notificación de prueba pedida por la propia persona
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return json({ error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' }, 401);
  const delivered = await sendToUser(userData.user.id, { ...REMINDER, body: 'Así se verán tus recordatorios. ¡Todo listo!', url: '/', tag: 'comida-amor-prueba' });
  if (delivered === 0) return json({ error: 'No se pudo enviar la notificación a este dispositivo. Vuelve a activar los recordatorios.' }, 409);
  return json({ ok: true, delivered });
});
