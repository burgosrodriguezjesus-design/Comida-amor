// Genera las fotos ilustradas de la demostración (server/seed/photos/*.jpg).
// Uso: node scripts/gen-demo-photos.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const OUT = path.resolve('server/seed/photos');
const W = 1200;
const H = 900;

const table = (color, grain) => `
  <rect width="${W}" height="${H}" fill="${color}"/>
  ${Array.from({ length: 9 }, (_, i) => `<rect x="0" y="${i * 100 + 40}" width="${W}" height="3" fill="${grain}" opacity=".35"/>`).join('')}
`;
const plate = (cx, cy, r, fill = '#fbf8f3') => `
  <circle cx="${cx + 10}" cy="${cy + 14}" r="${r}" fill="#000" opacity=".12"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.78}" fill="none" stroke="#e9e1d6" stroke-width="6"/>
`;
const cup = (cx, cy, r, liquid) => `
  <circle cx="${cx + 8}" cy="${cy + 12}" r="${r + 24}" fill="#000" opacity=".1"/>
  <circle cx="${cx}" cy="${cy}" r="${r + 24}" fill="#f6efe6"/>
  <rect x="${cx + r + 10}" y="${cy - 16}" width="60" height="32" rx="16" fill="#f6efe6"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/>
  <circle cx="${cx}" cy="${cy}" r="${r - 12}" fill="${liquid}"/>
  <circle cx="${cx - 18}" cy="${cy - 14}" r="${(r - 12) * 0.35}" fill="#fff" opacity=".18"/>
`;
const glass = (cx, cy, r, liquid) => `
  <circle cx="${cx + 8}" cy="${cy + 12}" r="${r}" fill="#000" opacity=".1"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" opacity=".85"/>
  <circle cx="${cx}" cy="${cy}" r="${r - 10}" fill="${liquid}"/>
  <path d="M ${cx - r * 0.5} ${cy - r * 0.55} A ${r * 0.8} ${r * 0.8} 0 0 1 ${cx + r * 0.2} ${cy - r * 0.75}" stroke="#fff" stroke-width="10" fill="none" opacity=".55" stroke-linecap="round"/>
`;

const scenes = {
  desayuno: `
    ${table('#c98f5c', '#a86f42')}
    ${plate(520, 470, 280)}
    <g transform="rotate(-8 470 450)">
      <rect x="330" y="330" width="230" height="200" rx="34" fill="#d99a4e"/>
      <rect x="350" y="350" width="190" height="160" rx="26" fill="#f1c27d"/>
      <path d="M370 420 q40 -30 80 0 t80 0" stroke="#b9a637" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>
    </g>
    <g transform="rotate(10 600 560)">
      <rect x="500" y="460" width="230" height="200" rx="34" fill="#d99a4e"/>
      <rect x="520" y="480" width="190" height="160" rx="26" fill="#f1c27d"/>
      <path d="M540 560 q40 -30 80 0 t80 0" stroke="#b9a637" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>
    </g>
    ${cup(950, 260, 105, '#b07a4f')}
    <circle cx="950" cy="260" r="40" fill="#d8b28c" opacity=".7"/>
    ${glass(960, 650, 110, '#f6a33a')}
  `,
  pasta: `
    ${table('#e9dccb', '#d6c4ad')}
    ${plate(560, 450, 330)}
    <circle cx="560" cy="450" r="230" fill="#e9b54f"/>
    ${Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2;
      const x = 560 + Math.cos(a) * (60 + (i % 5) * 30);
      const y = 450 + Math.sin(a) * (60 + (i % 4) * 32);
      return `<path d="M${x - 40} ${y} q20 -30 40 0 t40 0" stroke="#f6d27a" stroke-width="16" fill="none" stroke-linecap="round"/>`;
    }).join('')}
    <circle cx="560" cy="430" r="120" fill="#d2452f" opacity=".92"/>
    <circle cx="520" cy="400" r="22" fill="#b5321f"/>
    <circle cx="610" cy="470" r="18" fill="#b5321f"/>
    <path d="M500 470 q30 -20 60 0" stroke="#6b9a3a" stroke-width="12" fill="none" stroke-linecap="round"/>
    <ellipse cx="660" cy="360" rx="26" ry="14" fill="#5f9440" transform="rotate(-30 660 360)"/>
    <ellipse cx="690" cy="380" rx="26" ry="14" fill="#6ea84b" transform="rotate(20 690 380)"/>
    ${[[400, 560], [470, 610], [690, 580]].map(([x, y]) => `<rect x="${x}" y="${y}" width="90" height="60" rx="22" fill="#f3d9b3" stroke="#d9b07c" stroke-width="6"/>`).join('')}
    ${glass(1020, 220, 95, '#3b1f14')}
  `,
  ensalada: `
    ${table('#dfe7d3', '#c5d1b3')}
    ${plate(600, 450, 330, '#ffffff')}
    ${Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2;
      const rr = 80 + (i % 3) * 60;
      const x = 600 + Math.cos(a) * rr;
      const y = 450 + Math.sin(a) * rr;
      const c = ['#6aa84f', '#88c060', '#4f8a3a'][i % 3];
      return `<ellipse cx="${x}" cy="${y}" rx="70" ry="38" fill="${c}" transform="rotate(${(a * 180) / Math.PI} ${x} ${y})"/>`;
    }).join('')}
    ${[[520, 380], [680, 420], [600, 540], [700, 560], [470, 520]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="34" fill="#e2483c"/><circle cx="${x - 8}" cy="${y - 10}" r="8" fill="#fff" opacity=".35"/>`).join('')}
    ${[[560, 450], [650, 340], [520, 600]].map(([x, y]) => `<rect x="${x}" y="${y}" width="80" height="50" rx="16" fill="#f4e7c8" stroke="#e0c98f" stroke-width="5"/>`).join('')}
    ${glass(1030, 680, 100, '#cfe9f5')}
  `,
  pizza: `
    ${table('#7d4b33', '#6a3c27')}
    <circle cx="610" cy="465" r="360" fill="#000" opacity=".15"/>
    <circle cx="600" cy="450" r="360" fill="#d9a35b"/>
    <circle cx="600" cy="450" r="315" fill="#d8452e"/>
    ${Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      const rr = 60 + (i % 4) * 60;
      return `<circle cx="${600 + Math.cos(a) * rr}" cy="${450 + Math.sin(a) * rr}" r="${70 - (i % 3) * 12}" fill="#f5e3b0" opacity=".95"/>`;
    }).join('')}
    ${Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      return `<circle cx="${600 + Math.cos(a) * 180}" cy="${450 + Math.sin(a) * 180}" r="22" fill="#e9dfd3" stroke="#bfae98" stroke-width="5"/>`;
    }).join('')}
    ${Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + 0.7;
      return `<ellipse cx="${600 + Math.cos(a) * 110}" cy="${450 + Math.sin(a) * 110}" rx="20" ry="11" fill="#3e7d32" transform="rotate(${i * 50} ${600 + Math.cos(a) * 110} ${450 + Math.sin(a) * 110})"/>`;
    }).join('')}
    ${Array.from({ length: 4 }, (_, i) => {
      const a = (i / 4) * Math.PI;
      return `<line x1="${600 - Math.cos(a) * 360}" y1="${450 - Math.sin(a) * 360}" x2="${600 + Math.cos(a) * 360}" y2="${450 + Math.sin(a) * 360}" stroke="#a0662f" stroke-width="5" opacity=".6"/>`;
    }).join('')}
  `,
  fruta: `
    ${table('#f3e3c7', '#e5cfa9')}
    <g transform="rotate(-18 520 470)">
      <path d="M250 500 Q520 760 820 470 Q800 440 770 450 Q520 650 290 460 Z" fill="#000" opacity=".12" transform="translate(10 14)"/>
      <path d="M250 500 Q520 760 820 470 Q800 440 770 450 Q520 650 290 460 Z" fill="#f5cf3f"/>
      <path d="M300 470 Q520 640 770 455" stroke="#e0b52a" stroke-width="8" fill="none"/>
      <rect x="800" y="440" width="40" height="26" rx="8" fill="#6b4a25"/>
      <circle cx="255" cy="490" r="12" fill="#5b3f1f"/>
    </g>
    ${glass(930, 260, 120, '#d7ecf7')}
    <circle cx="930" cy="260" r="60" fill="#ffffff" opacity=".35"/>
  `,
  yogur: `
    ${table('#e8d6e4', '#d7bfd2')}
    <circle cx="610" cy="470" r="300" fill="#000" opacity=".12"/>
    <circle cx="600" cy="455" r="300" fill="#6c8ebf"/>
    <circle cx="600" cy="455" r="255" fill="#fbfaf7"/>
    ${Array.from({ length: 34 }, (_, i) => {
      const a = (i / 34) * Math.PI * 2 * 3;
      const rr = 30 + (i * 6) % 190;
      return `<ellipse cx="${600 + Math.cos(a) * rr}" cy="${455 + Math.sin(a) * rr}" rx="22" ry="14" fill="${['#e2b467', '#d39a45', '#c9893a'][i % 3]}" transform="rotate(${i * 37} ${600 + Math.cos(a) * rr} ${455 + Math.sin(a) * rr})"/>`;
    }).join('')}
    ${[[520, 380], [690, 520], [640, 360]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="26" fill="#7a3e8f"/><circle cx="${x - 7}" cy="${y - 8}" r="7" fill="#fff" opacity=".3"/>`).join('')}
    ${cup(1000, 700, 90, '#b07a4f')}
  `,
};

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: W, height: H } });
for (const [name, body] of Object.entries(scenes)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 82 });
  await page.setViewportSize({ width: 400, height: 300 });
  await page.setContent(`<html><body style="margin:0"><div style="width:400px;height:300px;overflow:hidden"><div style="transform:scale(${400 / W});transform-origin:0 0">${svg}</div></div></body></html>`);
  await page.screenshot({ path: path.join(OUT, `${name}_thumb.jpg`), type: 'jpeg', quality: 78 });
  await page.setViewportSize({ width: W, height: H });
  console.log('ok', name);
}
await browser.close();
