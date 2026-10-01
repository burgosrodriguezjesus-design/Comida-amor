// Revisión de maquetación en pantallas estrechas: busca desbordes horizontales y
// controles (campos, botones) que se montan unos sobre otros, en todas las pantallas.
// Uso: npm run build && node scripts/audit-layout.mjs

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = 5300 + Math.floor(Math.random() * 400);
const BASE = `http://localhost:${PORT}`;
const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? 'screenshots/audit');
fs.mkdirSync(OUT, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comida-amor-audit-'));
const server = spawn(process.execPath, ['dist/server/index.js'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, NODE_ENV: 'production', COOKIE_SECURE: 'false' },
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 1200));

const problems = [];

/** Se ejecuta en la página: devuelve desbordes y solapes entre controles visibles. */
function inspect() {
  const out = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) out.push(`desborde horizontal de la página (${document.documentElement.scrollWidth}px > ${vw}px)`);
  const dialog = [...document.querySelectorAll('[role="dialog"]')].pop();
  const scope = dialog ?? document;
  const controls = [...scope.querySelectorAll('input:not([type=file]):not(.sr-only), select, textarea, button, a[href]')].filter((el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && !el.closest('[aria-hidden="true"]') && !el.closest('nav');
  });
  // Parte realmente visible: recortada por los contenedores con scroll (lo que queda
  // bajo la barra fija de «Guardar» o la cabecera de una ventana no se ve).
  const visibleRect = (el) => {
    let r = el.getBoundingClientRect();
    let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (let p = el.parentElement; p; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.overflowX !== 'visible' || st.overflowY !== 'visible') {
        const pr = p.getBoundingClientRect();
        box = { left: Math.max(box.left, pr.left), top: Math.max(box.top, pr.top), right: Math.min(box.right, pr.right), bottom: Math.min(box.bottom, pr.bottom) };
      }
    }
    return box.right - box.left > 1 && box.bottom - box.top > 1 ? box : null;
  };
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('type') || el.tagName).trim().slice(0, 30);
  // Botones con fondo o borde (no enlaces de texto) aplastados: menos de 36 px de alto.
  for (const el of controls) {
    if (el.tagName !== 'BUTTON' || !visibleRect(el)) continue;
    const st = getComputedStyle(el);
    const styled = (st.backgroundColor !== 'rgba(0, 0, 0, 0)' && st.backgroundColor !== 'transparent') || parseFloat(st.borderTopWidth) > 0;
    const h = el.getBoundingClientRect().height;
    if (styled && h < 36 && !['switch', 'gridcell'].includes(el.getAttribute('role') ?? '')) out.push(`botón «${name(el)}» demasiado bajo (${Math.round(h)} px)`);
  }
  for (let i = 0; i < controls.length; i += 1) {
    const a = controls[i];
    const ra = visibleRect(a);
    if (!ra) continue;
    if (a.getBoundingClientRect().right > vw + 1 && !a.closest('.overflow-x-auto, .no-scrollbar')) out.push(`«${name(a)}» se sale por la derecha (${Math.round(a.getBoundingClientRect().right)} > ${vw})`);
    for (let j = i + 1; j < controls.length; j += 1) {
      const b = controls[j];
      if (a.contains(b) || b.contains(a)) continue;
      const rb = visibleRect(b);
      if (!rb) continue;
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      // Botones absolutos dentro de un campo (borrar búsqueda, ver contraseña, quitar foto) son intencionados.
      const overlay = [a, b].some((el) => getComputedStyle(el).position === 'absolute');
      if (w > 2 && h > 2 && !overlay) out.push(`«${name(a)}» y «${name(b)}» se solapan (${Math.round(w)}×${Math.round(h)}px)`);
    }
  }
  return out;
}

async function audit(page, label, shotName) {
  await page.waitForTimeout(350);
  for (const b of await page.getByRole('button', { name: 'Cerrar aviso' }).all()) await b.click().catch(() => undefined);
  const found = await page.evaluate(inspect);
  for (const f of found) problems.push(`[${label}] ${f}`);
  if (shotName) await page.screenshot({ path: path.join(OUT, `${shotName}.png`) });
  console.log(`  ${found.length ? '✗' : '✓'} ${label}${found.length ? `: ${found.length} problemas` : ''}`);
}

try {
  // Interfaz del navegador en español: fechas dd/mm/aaaa y horas de 24 h, como en un móvil en España.
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: ['--lang=es-ES'], env: { ...process.env, LANG: 'es_ES.UTF-8', LANGUAGE: 'es_ES' } });
  for (const width of [320, 360, 390]) {
    for (const scheme of ['light', 'dark']) {
      if (scheme === 'dark' && width !== 360) continue;
      console.log(`${width}px · ${scheme === 'dark' ? 'oscuro' : 'claro'}`);
      const context = await browser.newContext({ viewport: { width, height: 760 }, deviceScaleFactor: 2, locale: 'es-ES', timezoneId: 'Europe/Madrid', colorScheme: scheme, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      const tag = `${width}-${scheme}`;
      await page.goto(BASE);
      await audit(page, `${width} acceso`, `${tag}-acceso`);
      await page.getByRole('radio', { name: 'Crear cuenta' }).click();
      await audit(page, `${width} crear cuenta`);
      await page.getByRole('button', { name: /datos de demostración/ }).click();
      await page.getByText('Lo que has comido hoy').waitFor();
      await audit(page, `${width} hoy`, `${tag}-hoy`);
      await page.getByRole('button', { name: 'Opciones del registro' }).first().click();
      await page.getByRole('menuitem', { name: 'Eliminar' }).click();
      await page.getByRole('dialog', { name: '¿Eliminar este registro?' }).waitFor();
      await audit(page, `${width} confirmar eliminar`, `${tag}-confirmar`);
      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

      await page.getByRole('button', { name: /Registro rápido/ }).click();
      await page.getByLabel('¿Qué acabas de comer?').fill('Café con leche y un croissant');
      await audit(page, `${width} registro rápido`, `${tag}-rapido`);
      await page.getByRole('button', { name: 'Hace 30 min' }).click();
      await audit(page, `${width} registro rápido (hora cambiada)`);
      await page.getByRole('button', { name: /Más detalles/ }).click();
      await audit(page, `${width} formulario completo`, `${tag}-formulario`);
      await page.getByRole('button', { name: /cómo te encontrabas/ }).click();
      await page.getByRole('button', { name: 'Otros síntomas' }).click();
      await page.getByRole('dialog').evaluate((d) => d.querySelector('.overflow-y-auto')?.scrollTo(0, 99999));
      await audit(page, `${width} formulario con síntomas`, `${tag}-sintomas`);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').getByRole('button', { name: 'Descartar' }).click();

      await page.getByRole('link', { name: 'Calendario' }).click();
      await page.getByRole('grid').waitFor();
      await audit(page, `${width} calendario`, `${tag}-calendario`);
      await page.getByRole('radio', { name: 'Detalle' }).click();
      await audit(page, `${width} calendario detalle`);
      await page.getByRole('radio', { name: 'Semana' }).click();
      await audit(page, `${width} calendario semana`);

      await page.getByRole('link', { name: 'Historial' }).click();
      await page.getByPlaceholder(/Buscar/).fill('pizza');
      await page.getByText(/aparece en/).waitFor();
      await audit(page, `${width} historial`, `${tag}-historial`);
      await page.getByRole('button', { name: /Filtros/ }).click();
      await audit(page, `${width} filtros`, `${tag}-filtros`);
      await page.getByRole('dialog').getByRole('button', { name: 'Últimos 7 días' }).click();
      await audit(page, `${width} filtros con fechas`, `${tag}-filtros-fechas`);
      await page.keyboard.press('Escape');
      await page.getByRole('radio', { name: 'Estadísticas' }).click();
      await page.getByRole('heading', { name: 'Horarios habituales' }).waitFor();
      await audit(page, `${width} estadísticas`, `${tag}-estadisticas`);

      await page.getByRole('link', { name: 'Informe' }).click();
      await page.getByText('Vista previa').waitFor();
      await page.getByRole('button', { name: 'Elegir fechas' }).click();
      await page.getByText('Opciones del informe').click();
      await audit(page, `${width} informe`, `${tag}-informe`);

      await page.goto(`${BASE}/ajustes`);
      await page.getByRole('heading', { name: 'Recordatorios' }).waitFor();
      await page.getByRole('switch', { name: /Recordarme/ }).click();
      await page.getByRole('heading', { name: 'Recordatorios' }).scrollIntoViewIfNeeded();
      await audit(page, `${width} ajustes`, `${tag}-ajustes`);
      await context.close();
    }
  }
  await browser.close();
} catch (error) {
  problems.push(`la revisión falló: ${error.message.split('\n')[0]}`);
} finally {
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
const unique = [...new Set(problems)];
console.log(unique.length ? `\nProblemas:\n${unique.map((p) => `  - ${p}`).join('\n')}` : '\nSin problemas de maquetación.');
process.exit(unique.length ? 1 : 0);
