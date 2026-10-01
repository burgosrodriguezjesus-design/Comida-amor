// Genera los iconos PNG de la aplicación a partir del logotipo SVG.
// Uso: node scripts/gen-icons.mjs
import path from 'node:path';
import { chromium } from 'playwright';

const OUT = path.resolve('client/public/icons');
const shape = (bg, inset = 0, radius = 18) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
    <rect width="64" height="64" rx="${radius}" fill="${bg}"/>
    <g transform="translate(${inset} ${inset}) scale(${(64 - inset * 2) / 64})">
      <path d="M14 32h36a18 18 0 0 1-36 0Z" fill="#fff"/>
      <rect x="22" y="49" width="20" height="4" rx="2" fill="#fff" opacity=".85"/>
      <path d="M32 27.5c-.6-.5-6.5-4.4-6.5-8.3a3.6 3.6 0 0 1 6.5-2.2 3.6 3.6 0 0 1 6.5 2.2c0 3.9-5.9 7.8-6.5 8.3Z" fill="#fff"/>
    </g>
  </svg>`;
const badge = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
    <path d="M14 32h36a18 18 0 0 1-36 0Z" fill="#000"/>
    <path d="M32 27.5c-.6-.5-6.5-4.4-6.5-8.3a3.6 3.6 0 0 1 6.5-2.2 3.6 3.6 0 0 1 6.5 2.2c0 3.9-5.9 7.8-6.5 8.3Z" fill="#000"/>
  </svg>`;

const targets = [
  { file: 'icon-192.png', size: 192, svg: shape('#bd5038') },
  { file: 'icon-512.png', size: 512, svg: shape('#bd5038') },
  { file: 'icon-maskable-512.png', size: 512, svg: shape('#bd5038', 9, 0) },
  { file: 'apple-touch-icon.png', size: 180, svg: shape('#bd5038', 0, 0) },
  { file: 'badge-96.png', size: 96, svg: badge, transparent: true },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size } });
  await page.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${t.size}px;height:${t.size}px">${t.svg}</div></body></html>`);
  await page.screenshot({ path: path.join(OUT, t.file), omitBackground: Boolean(t.transparent) || t.file.startsWith('icon-') });
  await page.close();
  console.log('ok', t.file);
}
await browser.close();
