// Prueba de la app publicada (backend Supabase) con un navegador real y un Supabase
// simulado en memoria (window.__FAKE_SUPABASE__), porque este entorno no llega a supabase.co.
// La seguridad real (RLS) se prueba aparte con SQL en el proyecto de Supabase.
// Uso: npx vite build --mode webtest && node scripts/e2e-web.mjs

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = 4800 + Math.floor(Math.random() * 400);
const BASE = `http://localhost:${PORT}`;
const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? 'screenshots/web');
fs.mkdirSync(OUT, { recursive: true });

// Servidor estático con reescritura SPA (como Vercel).
const serverCode = `
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('dist/webtest');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,p);
if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(root,'index.html');
res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);}).listen(${PORT});`;
const server = spawn(process.execPath, ['-e', serverCode], { stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 600));

let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures += 1;
};
const errors = [];

// ---------- Supabase simulado (subconjunto que usa la app) ----------
const fakeSupabase = () => {
  const KEY = 'fake-supabase';
  const load = () => JSON.parse(localStorage.getItem(KEY) || '{"users":[],"tables":{},"files":{}}');
  const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  const uid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const session = () => JSON.parse(localStorage.getItem('fake-session') || 'null');
  const ok = (data, extra = {}) => ({ data, error: null, ...extra });
  const err = (message) => ({ data: null, error: { message } });
  window.__calls = [];

  function builder(table) {
    const q = { filters: [], op: 'select', payload: null, single: false, maybe: false, head: false, count: null, range: null, order: null, returning: false };
    const run = () => {
      const d = load();
      const s = session();
      if (!s) return err('JWT expired');
      const rows = (d.tables[table] ||= []);
      // Simulación de RLS: solo filas propias.
      const owner = table === 'profiles' ? 'id' : 'user_id';
      const mine = (r) => r[owner] === s.user.id;
      const match = (r) => mine(r) && q.filters.every(([c, op, v]) => (op === 'eq' ? r[c] === v : v.includes(r[c])));
      let result;
      if (q.op === 'select') {
        result = rows.filter(match);
      } else if (q.op === 'insert') {
        const row = { id: uid(), created_at: now(), updated_at: now(), notes: '', feeling_note: '', other_symptoms: '', symptoms: [], photo_ids: [], items: [], ...q.payload, [owner]: s.user.id };
        rows.push(row);
        result = [row];
      } else if (q.op === 'upsert') {
        const i = rows.findIndex((r) => r.user_id === s.user.id);
        const row = { ...q.payload, user_id: s.user.id };
        if (i >= 0) rows[i] = { ...rows[i], ...row };
        else rows.push(row);
        result = [row];
      } else if (q.op === 'update') {
        result = rows.filter(match);
        result.forEach((r) => Object.assign(r, q.payload));
      } else if (q.op === 'delete') {
        result = rows.filter(match);
        d.tables[table] = rows.filter((r) => !match(r));
      }
      save(d);
      if (q.order) result = [...result].sort((a, b) => String(a[q.order]).localeCompare(String(b[q.order])));
      if (q.range) result = result.slice(q.range[0], q.range[1] + 1);
      if (q.head) return ok(null, { count: result.length });
      if (q.single || q.maybe) {
        if (!result.length) return q.maybe ? ok(null) : err('no rows');
        return ok(result[0]);
      }
      return ok(result, { count: result.length });
    };
    const api = {
      select(_cols, opts) {
        if (q.op === 'select') q.op = 'select';
        if (opts?.head) q.head = true;
        q.returning = true;
        return api;
      },
      insert(p) { q.op = 'insert'; q.payload = p; return api; },
      upsert(p) { q.op = 'upsert'; q.payload = p; return api; },
      update(p) { q.op = 'update'; q.payload = p; return api; },
      delete() { q.op = 'delete'; return api; },
      eq(c, v) { q.filters.push([c, 'eq', v]); return api; },
      in(c, v) { q.filters.push([c, 'in', v]); return api; },
      order(c) { q.order = c; return api; },
      range(a, b) { q.range = [a, b]; return api; },
      single() { q.single = true; return api; },
      maybeSingle() { q.maybe = true; return api; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    return api;
  }

  const blobs = new Map();
  window.__FAKE_SUPABASE__ = {
    auth: {
      async getSession() { return { data: { session: session() } }; },
      async signInWithPassword({ email, password }) {
        const u = load().users.find((x) => x.email === email && x.password === password);
        if (!u) return { error: { message: 'Invalid login credentials' } };
        localStorage.setItem('fake-session', JSON.stringify({ user: { id: u.id, email: u.email, user_metadata: { name: u.name } } }));
        return { data: {}, error: null };
      },
      async signOut() { localStorage.removeItem('fake-session'); return { error: null }; },
      async updateUser({ password }) {
        const d = load(); d.users.find((x) => x.id === session().user.id).password = password; save(d); return { error: null };
      },
    },
    from: builder,
    rpc: async (name, args) => {
      window.__calls.push(name);
      if (name === 'register_push_subscription') return ok(null);
      return ok(null);
    },
    storage: {
      from: () => ({
        async upload(p, blob) { blobs.set(p, URL.createObjectURL(blob)); const d = load(); d.files[p] = true; save(d); return ok({ path: p }); },
        async remove(paths) { const d = load(); paths.forEach((p) => delete d.files[p]); save(d); return ok(paths); },
        async createSignedUrls(paths) { return ok(paths.map((p) => ({ path: p, signedUrl: blobs.get(p) ?? null }))); },
      }),
    },
    functions: {
      async invoke(name, { body }) {
        window.__calls.push(name);
        const d = load();
        if (name === 'signup') {
          if (d.users.some((u) => u.email === body.email.toLowerCase())) {
            return { error: { context: { status: 409, json: async () => ({ error: 'Ya existe una cuenta con este correo. Prueba a iniciar sesión.' }) } } };
          }
          const id = uid();
          d.users.push({ id, email: body.email.toLowerCase(), password: body.password, name: body.name });
          (d.tables.profiles ||= []).push({ id, name: body.name, timezone: body.timezone, created_at: now() });
          save(d);
          return { data: { ok: true }, error: null };
        }
        if (name === 'delete-account') {
          const s = session();
          const u = d.users.find((x) => x.id === s.user.id);
          if (u.password !== body.password) return { error: { context: { status: 403, json: async () => ({ error: 'La contraseña no es correcta.' }) } } };
          for (const t of Object.keys(d.tables)) d.tables[t] = d.tables[t].filter((r) => (r.user_id ?? r.id) !== s.user.id);
          if (body.mode === 'account') d.users = d.users.filter((x) => x.id !== s.user.id);
          d.files = Object.fromEntries(Object.entries(d.files).filter(([p]) => !p.startsWith(s.user.id)));
          save(d);
          return { data: { ok: true }, error: null };
        }
        return { data: { ok: true }, error: null };
      },
    },
  };
};

try {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: true });
  await context.addInitScript(fakeSupabase);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|404/.test(m.text()) && errors.push(m.text()));
  const shot = async (name) => {
    for (const b of await page.getByRole('button', { name: 'Cerrar aviso' }).all()) await b.click().catch(() => undefined);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  };

  console.log('App publicada (Supabase simulado)');
  await page.goto(BASE);
  await page.getByRole('radio', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Tu nombre').fill('Marta');
  await page.getByLabel('Correo electrónico').fill('marta@example.com');
  await page.getByLabel('Contraseña', { exact: true }).fill('una-clave-segura');
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await page.getByText('Aún no has registrado nada hoy').waitFor();
  check(await page.getByRole('heading', { name: /Marta/ }).isVisible(), 'alta e inicio de sesión');

  await page.getByRole('button', { name: /Registro rápido/ }).first().click();
  await page.getByLabel('¿Qué acabas de comer?').fill('Café con leche y un croissant');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByText(/^Guardado ·/).waitFor();
  check(await page.getByText('Un croissant').isVisible(), 'registro rápido guardado en Supabase');

  await page.getByRole('button', { name: 'Añadir comida' }).click();
  await page.getByLabel('Alimento 1').fill('Lentejas');
  await page.getByLabel(/Cantidad de Lentejas/).fill('1 plato');
  await page.locator('input[type=file]').setInputFiles(path.resolve('server/seed/photos/pasta.jpg'));
  await page.getByRole('button', { name: 'Quitar foto' }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByText(/^Guardado ·/).waitFor();
  await page.waitForTimeout(300);
  check((await page.locator('article img').count()) === 1, 'foto subida al almacén privado y mostrada');
  await shot('01-hoy');

  // Editar y borrar
  const card = page.getByRole('article').filter({ hasText: 'Lentejas' });
  await card.getByRole('button', { name: 'Opciones del registro' }).click();
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  await page.getByLabel(/Cantidad de Lentejas/).fill('2 platos');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.getByText('Cambios guardados').waitFor();
  check(await page.getByText('2 platos').isVisible(), 'edición guardada');

  // Recargar: la sesión y los datos siguen
  await page.reload();
  await page.getByText('Lo que has comido hoy').waitFor();
  await page.waitForTimeout(300);
  check((await page.getByRole('article').count()) === 2, 'la sesión y los registros siguen tras recargar');

  // Demo dentro de la app publicada
  await page.goto(`${BASE}/historial`);
  await page.getByPlaceholder(/Buscar/).fill('croissant');
  await page.getByText(/aparece en 1 día/).waitFor();
  check(true, 'la búsqueda funciona con los datos de Supabase');

  await page.goto(`${BASE}/informe`);
  await page.getByText('Vista previa').waitFor();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF' }).click()]);
  check((await download.path()) !== null, 'PDF generado');

  await page.goto(`${BASE}/ajustes`);
  await page.getByRole('heading', { name: 'Privacidad y datos' }).waitFor();
  check(await page.getByText('Correo: marta@example.com').isVisible(), 'ajustes muestran la cuenta');
  await shot('02-ajustes');

  // Cerrar sesión y volver a entrar
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar' }).waitFor();
  await page.getByLabel('Correo electrónico').fill('marta@example.com');
  await page.getByLabel('Contraseña', { exact: true }).fill('mala-clave');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByText('El correo o la contraseña no son correctos.').waitFor();
  check(true, 'contraseña incorrecta rechazada');
  await page.getByLabel('Contraseña', { exact: true }).fill('una-clave-segura');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByText('Lo que has comido hoy').waitFor();
  check(true, 'inicio de sesión de nuevo');

  // Datos de demostración (en memoria) y vuelta a la cuenta
  await page.goto(`${BASE}/ajustes`);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('button', { name: /datos de demostración/ }).click();
  await page.getByText('Lo que has comido hoy').waitFor();
  await page.waitForTimeout(400);
  check((await page.locator('article img').count()) > 0, 'la demostración muestra fotos de ejemplo');
  await shot('03-demo');

  // Borrar cuenta
  await page.getByRole('button', { name: 'Salir de la demo y crear mi cuenta' }).click().catch(() => undefined);
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Entrar' }).waitFor();
  await page.getByLabel('Correo electrónico').fill('marta@example.com');
  await page.getByLabel('Contraseña', { exact: true }).fill('una-clave-segura');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByText('Lo que has comido hoy').waitFor();
  await page.goto(`${BASE}/ajustes`);
  await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
  await page.getByLabel('Tu contraseña').fill('una-clave-segura');
  await page.getByLabel(/Escribe BORRAR/).fill('BORRAR');
  await page.getByRole('button', { name: 'Eliminar cuenta y datos' }).click();
  await page.getByRole('button', { name: 'Entrar' }).waitFor();
  const left = await page.evaluate(() => JSON.parse(localStorage.getItem('fake-supabase')));
  check(left.users.length === 0 && Object.keys(left.files).length === 0, 'cuenta, registros y fotos eliminados');
  await browser.close();
} catch (error) {
  failures += 1;
  console.error(error);
} finally {
  server.kill();
}
if (errors.length) {
  console.log('\nErrores de consola:');
  for (const e of errors) console.log('  -', e);
}
console.log(failures === 0 && errors.length === 0 ? '\nTodo correcto.' : `\n${failures} fallos, ${errors.length} errores de consola.`);
process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
