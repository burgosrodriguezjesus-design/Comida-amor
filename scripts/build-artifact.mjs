// Empaqueta la versión de prueba (solo navegador) en una única página para publicarla
// en claude.ai: JS, CSS y tipografías van dentro del HTML; las fotos de ejemplo, al lado.
// Uso: npm run build:artifact

import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist/artifact');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const jsFile = /<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
const cssFile = /<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"/.exec(html)?.[1];
if (!jsFile || !cssFile) throw new Error('No se encontraron el JS o el CSS compilados');

const js = fs.readFileSync(path.join(dist, jsFile), 'utf8');
const css = fs.readFileSync(path.join(dist, cssFile), 'utf8');
const themeInit = fs.readFileSync('client/public/theme-init.js', 'utf8');
if (/<\/script/i.test(js) || /<!--/.test(js)) throw new Error('El JS contiene secuencias que no se pueden incrustar en <script>');
if (/<\/style/i.test(css)) throw new Error('El CSS contiene </style>');

// La página publicada recibe su propio esqueleto (doctype, head, body): aquí solo va el contenido.
const page = `<title>Comida Amor</title>
<style>${css}</style>
<script>${themeInit}</script>
<div id="root"></div>
<script type="module">${js}</script>
`;
fs.writeFileSync(path.join(dist, 'comida-amor.html'), page);

// Copia para probarla en local con el mismo esqueleto que añade claude.ai.
fs.writeFileSync(
  path.join(dist, 'preview.html'),
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${page}</body></html>`,
);

const demoDir = path.join(dist, 'demo');
fs.mkdirSync(demoDir, { recursive: true });
for (const file of fs.readdirSync('server/seed/photos')) {
  if (file.endsWith('.jpg')) fs.copyFileSync(path.join('server/seed/photos', file), path.join(demoDir, file));
}
const size = (fs.statSync(path.join(dist, 'comida-amor.html')).size / 1024 / 1024).toFixed(2);
console.log(`Página lista: dist/artifact/comida-amor.html (${size} MB) + ${fs.readdirSync(demoDir).length} fotos de ejemplo`);
