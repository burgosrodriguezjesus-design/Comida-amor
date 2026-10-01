// Alta de cuentas: crea la cuenta ya confirmada (sin depender del envío de correos)
// y la app inicia sesión a continuación. Se puede desactivar con allow_registration = false.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Límite sencillo por IP (por instancia).
const attempts = new Map<string, { count: number; reset: number }>();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconocida';
  const now = Date.now();
  const bucket = attempts.get(ip);
  if (bucket && bucket.reset > now && bucket.count >= 10) return json({ error: 'Demasiados intentos. Espera un rato y vuelve a intentarlo.' }, 429);
  attempts.set(ip, bucket && bucket.reset > now ? { ...bucket, count: bucket.count + 1 } : { count: 1, reset: now + 3_600_000 });

  const { data: config } = await admin.rpc('push_config');
  if ((config as Record<string, string> | null)?.allow_registration === 'false') {
    return json({ error: 'El registro de nuevas cuentas está desactivado.' }, 403);
  }

  let body: { name?: unknown; email?: unknown; password?: unknown; timezone?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Datos no válidos.' }, 400);
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const timezone = typeof body.timezone === 'string' && body.timezone.length <= 64 ? body.timezone : 'Europe/Madrid';
  if (!name || name.length > 60) return json({ error: 'Escribe tu nombre.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return json({ error: 'Escribe un correo electrónico válido.' }, 400);
  if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);
  if (password.length > 72) return json({ error: 'La contraseña es demasiado larga (máximo 72 caracteres).' }, 400);

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, timezone },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return json({ error: 'Ya existe una cuenta con este correo. Prueba a iniciar sesión.' }, 409);
    }
    if (/password/i.test(error.message)) return json({ error: 'La contraseña no es válida. Prueba con otra más larga.' }, 400);
    console.error('signup', error.message);
    return json({ error: 'No se pudo crear la cuenta. Inténtalo de nuevo.' }, 500);
  }
  return json({ ok: true }, 201);
});
