// Prueba de la versión de prueba (una sola página, sin servidor de datos).
// Se ejecuta dos veces: con el almacenamiento del navegador (IndexedDB) y con una
// simulación del almacén privado de claude.ai (window.claude).
// Uso: npm run build:artifact && node scripts/e2e-artifact.mjs

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = 4300 + Math.floor(Math.random() * 400);
const BASE = `http://localhost:${PORT}/preview.html`;
const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? 'screenshots/artifact');
fs.mkdirSync(OUT, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', 'dist/artifact'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures += 1;
};
const errors = [];

// Simulación mínima de window.claude (db + user + downloads) que guarda en localStorage.
const fakeClaude = () => {
  const KEY = 'fake-claude-db';
  const load = () => JSON.parse(localStorage.getItem(KEY) || '{}');
  const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  const segs = (p) => p.split('/').length;
  const snap = (id, data) => ({ id, exists: data !== undefined, data: () => (data === undefined ? undefined : JSON.parse(JSON.stringify(data))), metadata: {} });
  const docRef = (p) => {
    if (segs(p) % 2 !== 0) throw new TypeError(`ruta de documento con número impar de segmentos: ${p}`);
    return {
      id: p.split('/').pop(),
      path: p,
      get: async () => snap(p.split('/').pop(), load()[p]),
      set: async (data) => {
        if (JSON.stringify(data).length > 256 * 1024) throw { code: 'invalid_argument', message: 'demasiado grande' };
        const d = load();
        d[p] = data;
        save(d);
      },
      delete: async () => {
        const d = load();
        delete d[p];
        save(d);
      },
      collection: (name) => collRef(`${p}/${name}`),
    };
  };
  const collRef = (p) => {
    if (segs(p) % 2 !== 1) throw new TypeError(`ruta de colección con número par de segmentos: ${p}`);
    const query = (n) => ({
      limit: (m) => query(m),
      get: async () => {
        const d = load();
        const docs = Object.keys(d)
          .filter((k) => k.startsWith(`${p}/`) && segs(k) === segs(p) + 1)
          .sort()
          .slice(0, n ?? 1000)
          .map((k) => snap(k.split('/').pop(), d[k]));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    });
    return { path: p, doc: (id) => docRef(`${p}/${id}`), ...query() };
  };
  const db = Object.freeze({ doc: docRef, collection: collRef });
  const user = Object.freeze({ id: async () => 'u_prueba' });
  window.__downloads = [];
  const downloads = Object.freeze({
    save: async ({ filename, data }) => {
      window.__downloads.push({ filename, size: data.size ?? data.length });
      return { status: 'saved' };
    },
  });
  window.claude = { use: async (name) => ({ db, user, downloads })[name] ?? null };
};

async function run(label, withClaude) {
  console.log(label);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: true });
  if (withClaude) await context.addInitScript(fakeClaude);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`[${label}] ${m.text()}`));
  page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/favicon.ico') && errors.push(`[${label}] ${r.status()} ${r.url()}`));
  const shot = async (name) => {
    for (const b of await page.getByRole('button', { name: 'Cerrar aviso' }).all()) await b.click().catch(() => undefined);
    await page.screenshot({ path: path.join(OUT, `${withClaude ? 'claude' : 'navegador'}-${name}.png`) });
  };

  await page.goto(BASE);
  await page.getByText('¿Cómo te llamas?').waitFor();
  await shot('01-bienvenida');

  // Demostración
  await page.getByRole('button', { name: /datos de ejemplo/ }).click();
  await page.getByText('Lo que has comido hoy').waitFor();
  await page.waitForTimeout(500);
  check((await page.getByRole('article').count()) > 0, 'la demostración muestra registros de hoy');
  check((await page.locator('article img').count()) > 0, 'con fotos de ejemplo');
  await shot('02-demo-hoy');
  await page.getByRole('link', { name: 'Historial' }).click();
  await page.getByPlaceholder(/Buscar/).fill('pizza');
  await page.getByText(/aparece en/).waitFor();
  check(true, 'la búsqueda funciona en la demostración');
  await page.getByRole('radio', { name: 'Estadísticas' }).click();
  await page.getByRole('heading', { name: 'Horarios habituales' }).waitFor();
  await shot('03-demo-estadisticas');
  await page.getByRole('button', { name: 'Salir y empezar mi diario' }).first().click();
  await page.getByText('¿Cómo te llamas?').waitFor();
  check(true, 'se puede salir de la demostración');

  // Diario propio
  await page.getByLabel('¿Cómo te llamas?').fill('Marta');
  await page.getByRole('button', { name: 'Empezar mi diario' }).click();
  await page.getByText('Aún no has registrado nada hoy').waitFor({ timeout: 8000 }).catch(async (e) => {
    await shot('error-empezar');
    throw e;
  });
  await page.getByRole('button', { name: /Registro rápido/ }).first().click();
  await page.getByLabel('¿Qué acabas de comer?').fill('Café con leche y una tostada');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByText(/^Guardado ·/).waitFor();
  check(await page.getByText('Una tostada').isVisible(), 'el registro rápido aparece en Hoy');

  await page.getByRole('button', { name: 'Añadir comida' }).click();
  await page.getByLabel('Alimento 1').fill('Lentejas');
  await page.getByLabel(/Cantidad de Lentejas/).fill('1 plato');
  await page.locator('input[type=file]').setInputFiles(path.resolve('server/seed/photos/pasta.jpg'));
  await page.getByRole('button', { name: 'Quitar foto' }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /cómo te encontrabas/ }).click();
  await page.getByRole('button', { name: 'Sin síntomas' }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByText(/^Guardado ·/).waitFor();
  await page.waitForTimeout(300);
  check((await page.getByRole('article').count()) === 2, 'el formulario completo guarda el registro');
  await shot('04-diario-hoy');

  // Persistencia tras recargar
  await page.reload();
  await page.getByText('Lo que has comido hoy').waitFor();
  await page.waitForTimeout(500);
  check((await page.getByRole('article').count()) === 2, 'los registros siguen ahí tras recargar');
  check((await page.locator('article img').count()) === 1, 'la foto también se conserva');

  // Informe y PDF
  await page.getByRole('link', { name: 'Informe' }).click();
  await page.getByText('Vista previa').waitFor();
  check((await page.getByRole('button', { name: 'Imprimir' }).count()) === 0, 'sin botón de imprimir en la versión de prueba');
  if (withClaude) {
    await page.getByRole('button', { name: 'Descargar PDF' }).click();
    await page.waitForFunction(() => window.__downloads.length > 0, null, { timeout: 15000 });
    const saved = await page.evaluate(() => window.__downloads[0]);
    check(saved.filename.endsWith('.pdf') && saved.size > 3000, `PDF entregado a la descarga de claude.ai (${Math.round(saved.size / 1024)} KB)`);
  } else {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar PDF' }).click()]);
    check((await download.path()) !== null, 'PDF descargado');
  }
  await shot('05-informe');

  // Ajustes
  await page.getByRole('link', { name: 'Ajustes' }).first().click().catch(async () => page.getByRole('link', { name: 'Ajustes' }).click());
  await page.getByRole('heading', { name: 'Privacidad y datos' }).waitFor();
  const privacy = await page.getByRole('heading', { name: 'Privacidad y datos' }).locator('..').innerText();
  check(withClaude ? /cuenta de Claude/.test(privacy) : /este navegador/.test(privacy), 'indica dónde se guardan los datos');
  await shot('06-ajustes');

  if (withClaude) {
    const stored = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fake-claude-db') || '{}')));
    check(stored.every((k) => k.startsWith('data/users/u_prueba/')), 'todo se guarda en el espacio privado de la persona');
    check(stored.some((k) => k.includes('/media/photos/')), 'la foto va en su propia colección');
  }

  // Borrar todo
  await page.getByRole('button', { name: 'Borrar todo y empezar de cero' }).click();
  await page.getByLabel(/Escribe BORRAR/).fill('BORRAR');
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar todo' }).click();
  await page.getByText('¿Cómo te llamas?').waitFor();
  check(true, 'borrar todo vuelve a la bienvenida');
  if (withClaude) {
    const left = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fake-claude-db') || '{}')).length);
    check(left === 0, 'no quedan datos guardados');
  }
  await browser.close();
}

try {
  await run('Versión de prueba · almacenamiento del navegador', false);
  await run('Versión de prueba · almacén privado de claude.ai (simulado)', true);
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
