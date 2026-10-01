// Prueba de extremo a extremo con un navegador real (Playwright + Chromium).
// Arranca la app compilada con una base de datos temporal, recorre todas las
// pantallas y los flujos principales, y guarda capturas en ./screenshots.
//
// Uso: npm run build && npm run e2e

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = 3200 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? 'screenshots');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comida-amor-e2e-'));
fs.mkdirSync(OUT, { recursive: true });

const server = spawn(process.execPath, ['dist/server/index.js'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, NODE_ENV: 'production', COOKIE_SECURE: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* todavía arrancando */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('El servidor no arrancó');
}

let failures = 0;
function check(condition, message) {
  if (condition) console.log(`  ✓ ${message}`);
  else {
    failures += 1;
    console.log(`  ✗ ${message}`);
  }
}

const errors = [];
function watch(page, label) {
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errors.push(`[${label}] ${m.text()}`);
  });
}

async function shot(page, name, fullPage = false) {
  // Se cierran los avisos flotantes para que no tapen la captura.
  for (const button of await page.getByRole('button', { name: 'Cerrar aviso' }).all()) await button.click().catch(() => undefined);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
}

try {
  await waitForServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });

  // ---------------- Móvil, cuenta demo ----------------
  console.log('Móvil · demostración');
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    acceptDownloads: true,
    hasTouch: true,
  });
  const page = await mobile.newPage();
  watch(page, 'móvil');
  await page.goto(BASE);
  await shot(page, '01-acceso');
  await page.getByRole('button', { name: /datos de demostración/ }).click();
  await page.getByText('Lo que has comido hoy').waitFor();
  await page.waitForTimeout(500);
  await shot(page, '02-hoy');
  check(await page.getByRole('heading', { name: /Buen[oa]s/ }).isVisible(), 'saludo visible');
  check((await page.getByRole('article').count()) > 0, 'hay registros de hoy');

  // Registro rápido
  const before = await page.getByRole('article').count();
  await page.getByRole('button', { name: /Registro rápido/ }).click();
  await page.getByLabel('¿Qué acabas de comer?').fill('Café con leche y un croissant');
  await page.waitForTimeout(250);
  await shot(page, '03-registro-rapido');
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByText(/^Guardado ·/).waitFor();
  check(Date.now() - t0 < 3000, `registro rápido guardado en ${Date.now() - t0} ms`);
  await page.waitForTimeout(400);
  check((await page.getByRole('article').count()) === before + 1, 'el registro aparece inmediatamente en Hoy');
  check(await page.getByText('Un croissant').first().isVisible(), 'el croissant aparece en la lista');

  // Deshacer
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await page.waitForTimeout(700);
  check((await page.getByRole('article').count()) === before, 'deshacer elimina el registro');

  // Formulario completo
  await page.getByRole('button', { name: 'Añadir comida' }).click();
  await page.waitForTimeout(400);
  await shot(page, '04a-formulario-arriba');
  await page.getByRole('radio', { name: /Merienda/ }).click();
  await page.getByLabel('Alimento 1').fill('Tostada con jamón');
  await page.getByLabel(/Cantidad de Tostada/).fill('1 rebanada');
  await page.getByRole('button', { name: 'Añadir bebida' }).click();
  await page.getByLabel('Bebida 1').fill('Té verde');
  await page.getByLabel(/Cantidad de Té verde/).fill('1 taza');
  await page.getByLabel('Notas (opcional)').fill('En la terraza');
  await page.getByRole('button', { name: /cómo te encontrabas/ }).click();
  await page.getByRole('button', { name: 'Hinchazón' }).click();
  await page.getByLabel('Cómo te encontrabas').fill('Un poco de hinchazón');
  // Foto
  await page.locator('input[type=file]').setInputFiles(path.resolve('server/seed/photos/yogur.jpg'));
  await page.getByRole('button', { name: 'Quitar foto' }).waitFor({ timeout: 10000 });
  await shot(page, '04-formulario-completo');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByText(/^Guardado · Merienda/).waitFor();
  await page.waitForTimeout(400);
  const card = page.getByRole('article').filter({ hasText: 'Tostada con jamón' });
  check(await card.isVisible(), 'el registro completo aparece en Hoy');
  check(await card.getByText('En la terraza').isVisible(), 'con sus notas');
  check(await card.getByRole('img').count() === 1 || (await card.locator('img').count()) === 1, 'con su foto');

  // Editar
  await card.getByRole('button', { name: 'Opciones del registro' }).click();
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  await page.getByLabel(/Cantidad de Tostada/).fill('2 rebanadas');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.getByText('Cambios guardados').waitFor();
  check(await page.getByText('2 rebanadas').isVisible(), 'la edición se refleja');

  // Eliminar
  await page.getByRole('article').filter({ hasText: 'Tostada con jamón' }).getByRole('button', { name: 'Opciones del registro' }).click();
  await page.getByRole('menuitem', { name: 'Eliminar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await page.getByText('Registro eliminado').waitFor();
  await page.waitForTimeout(400);
  check((await page.getByRole('article').filter({ hasText: 'Tostada con jamón' }).count()) === 0, 'el registro se elimina');

  // Calendario
  await page.getByRole('link', { name: 'Calendario' }).click();
  await page.getByRole('grid').waitFor();
  await page.waitForTimeout(400);
  await shot(page, '05-calendario', true);
  const dayButtons = page.getByRole('gridcell', { name: /registros/ });
  check((await dayButtons.count()) > 10, 'el calendario marca los días con registros');
  await page.getByRole('button', { name: 'Día anterior' }).click();
  await page.getByRole('button', { name: 'Día anterior' }).click();
  await page.waitForTimeout(400);
  check(await page.getByText('Pasta con pollo').isVisible(), 'el martes muestra «Pasta con pollo»');
  await shot(page, '06-calendario-dia', true);
  await page.getByRole('radio', { name: 'Semana' }).click();
  await page.waitForTimeout(500);
  await shot(page, '07-calendario-semana', true);

  // Historial + búsqueda
  await page.getByRole('link', { name: 'Historial' }).click();
  await page.getByPlaceholder(/Buscar/).fill('pizza');
  await page.getByText(/aparece en/).waitFor();
  await page.waitForTimeout(300);
  check(await page.getByText(/«pizza» aparece en \d+ días/).isVisible(), 'la búsqueda «pizza» muestra los días');
  await shot(page, '08-historial-busqueda', true);
  await page.getByRole('button', { name: /Filtros/ }).click();
  const filters = page.getByRole('dialog', { name: 'Filtros' });
  await filters.getByRole('button', { name: 'Últimos 30 días' }).click();
  await filters.getByRole('button', { name: 'Cena', exact: true }).click();
  await shot(page, '09-filtros');
  await page.getByRole('button', { name: 'Ver resultados' }).click();
  await page.waitForTimeout(500);
  check(await page.getByRole('button', { name: 'Quitar filtro Cena' }).isVisible(), 'el filtro de tipo queda activo');

  // Estadísticas
  await page.getByRole('radio', { name: 'Estadísticas' }).click();
  await page.getByRole('heading', { name: 'Horarios habituales' }).waitFor();
  await page.waitForTimeout(400);
  await shot(page, '10-estadisticas', true);

  // Informe + PDF
  await page.getByRole('link', { name: 'Informe' }).click();
  await page.getByRole('heading', { name: 'Diario de alimentación' }).waitFor();
  await page.waitForTimeout(400);
  await shot(page, '11-informe', true);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF' }).click()]);
  const pdfPath = path.join(OUT, 'informe-ejemplo.pdf');
  await download.saveAs(pdfPath);
  const pdf = fs.readFileSync(pdfPath);
  check(pdf.subarray(0, 4).toString() === '%PDF' && pdf.length > 5000, `PDF generado (${Math.round(pdf.length / 1024)} KB)`);

  // Ajustes
  await page.goto(`${BASE}/ajustes`);
  await page.getByRole('heading', { name: 'Recordatorios' }).waitFor();
  await page.getByRole('switch', { name: /Recordarme/ }).click();
  await page.waitForTimeout(500);
  await shot(page, '12-ajustes', true);

  // Modo oscuro
  await page.getByRole('radio', { name: 'Oscuro' }).click();
  await page.goto(BASE);
  await page.getByText('Lo que has comido hoy').waitFor();
  await page.waitForTimeout(400);
  await shot(page, '13-hoy-oscuro');
  await page.getByRole('button', { name: /Registro rápido/ }).click();
  await page.waitForTimeout(400);
  await shot(page, '14-registro-rapido-oscuro');
  await page.keyboard.press('Escape');
  await page.goto(`${BASE}/historial?vista=estadisticas`);
  await page.getByRole('heading', { name: 'Horarios habituales' }).waitFor();
  await page.waitForTimeout(400);
  await shot(page, '15-estadisticas-oscuro', true);

  // ---------------- Escritorio ----------------
  console.log('Escritorio');
  const desktop = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  const dpage = await desktop.newPage();
  watch(dpage, 'escritorio');
  await dpage.goto(BASE);
  await dpage.getByRole('button', { name: /datos de demostración/ }).click();
  await dpage.getByText('Lo que has comido hoy').waitFor();
  await dpage.waitForTimeout(400);
  await shot(dpage, '20-escritorio-hoy');
  await dpage.keyboard.press('n');
  check(await dpage.getByRole('dialog', { name: 'Registro rápido' }).isVisible(), 'la tecla N abre el registro rápido');
  await dpage.keyboard.press('Escape');
  await dpage.getByRole('link', { name: 'Calendario' }).click();
  await dpage.getByRole('grid').waitFor();
  await dpage.waitForTimeout(400);
  await shot(dpage, '21-escritorio-calendario');
  await dpage.getByRole('link', { name: 'Informe' }).click();
  await dpage.getByText('Vista previa').waitFor();
  await shot(dpage, '22-escritorio-informe');

  // ---------------- Cuenta nueva ----------------
  console.log('Cuenta nueva');
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  const fpage = await fresh.newPage();
  watch(fpage, 'cuenta nueva');
  await fpage.goto(BASE);
  await fpage.getByRole('radio', { name: 'Crear cuenta' }).click();
  await fpage.getByLabel('Tu nombre').fill('Marta');
  await fpage.getByLabel('Correo electrónico').fill('marta@example.com');
  await fpage.getByLabel('Contraseña', { exact: true }).fill('una-clave-segura');
  await fpage.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await fpage.getByText('Aún no has registrado nada hoy').waitFor();
  await shot(fpage, '30-cuenta-nueva-vacia');
  check(await fpage.getByRole('heading', { name: /Marta/ }).isVisible(), 'la cuenta nueva saluda por el nombre');
  await fpage.getByRole('button', { name: /Registro rápido/ }).first().click();
  await fpage.getByLabel('¿Qué acabas de comer?').fill('Yogur con fresas');
  await fpage.keyboard.press('Enter');
  await fpage.getByText(/^Guardado ·/).waitFor();
  check(await fpage.getByText('Yogur con fresas').isVisible(), 'Enter guarda el registro rápido');
  check((await fpage.request.get(`${BASE}/api/entries`)).status() === 200, 'la API responde con sesión');
  // Aislamiento: la cuenta nueva no ve datos de la demo
  const list = await (await fpage.request.get(`${BASE}/api/entries?q=pizza`)).json();
  check(list.total === 0, 'una cuenta no ve los registros de otra');
  await fpage.goto(`${BASE}/ajustes`);
  await fpage.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await fpage.getByRole('button', { name: 'Entrar' }).waitFor();
  check((await fpage.request.get(`${BASE}/api/entries`)).status() === 401, 'tras cerrar sesión la API pide autenticación');

  await browser.close();
} catch (error) {
  failures += 1;
  console.error(error);
} finally {
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

if (errors.length) {
  console.log('\nErrores en la consola del navegador:');
  for (const e of errors) console.log('  -', e);
}
console.log(failures === 0 && errors.length === 0 ? '\nTodo correcto.' : `\n${failures} comprobaciones fallidas, ${errors.length} errores de consola.`);
process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
