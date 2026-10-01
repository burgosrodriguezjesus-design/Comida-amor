// Datos de demostración realistas (dieta española) para probar todas las pantallas.
// Las fechas son relativas al día de hoy, así que siempre parecen recientes.

import fs from 'node:fs';
import path from 'node:path';
import type { AppContext } from '../context';
import type { ItemKind, MealType, SymptomCode } from '../../../shared/constants';
import { addDays, minutesToTime, timeToMinutes } from '../../../shared/dates';
import { createEntry, deleteAllEntries, type EntryInputParsed } from '../services/entries';
import { savePhoto } from '../services/photos';

type Item = [name: string, quantity: string, kind?: ItemKind];

interface Template {
  items: Item[];
  photo?: string;
}

const t = (photo: string | undefined, ...items: Item[]): Template => ({ items, photo });

const BREAKFASTS: Template[] = [
  t('desayuno', ['Café con leche', '1 taza', 'drink'], ['Tostadas con aceite', '2'], ['Zumo de naranja', '1 vaso', 'drink']),
  t(undefined, ['Café con leche', '1 taza', 'drink'], ['Tostada con tomate y aceite', '1']),
  t(undefined, ['Café con leche', '1 taza', 'drink'], ['Galletas María', '4']),
  t('yogur', ['Yogur natural con cereales', '1 bol'], ['Café solo', '1 taza', 'drink']),
  t(undefined, ['Colacao', '1 taza', 'drink'], ['Magdalenas', '2']),
  t(undefined, ['Café con leche', '1 taza', 'drink'], ['Tostada con jamón', '1']),
  t(undefined, ['Té verde', '1 taza', 'drink'], ['Pan integral con aguacate', '1 rebanada']),
];

const MID_MORNING: Template[] = [
  t('fruta', ['Plátano', '1']),
  t(undefined, ['Manzana', '1']),
  t(undefined, ['Yogur natural', '1']),
  t(undefined, ['Café solo', '1 taza', 'drink']),
  t(undefined, ['Almendras', '1 puñado']),
  t(undefined, ['Barrita de cereales', '1']),
  t(undefined, ['Plátano', '1'], ['Agua', '500 ml', 'drink']),
];

const LUNCHES: Template[] = [
  t(undefined, ['Lentejas con chorizo', '1 plato'], ['Pan', '1 trozo'], ['Naranja', '1'], ['Agua', '1 vaso', 'drink']),
  t('pasta', ['Pasta con tomate', '1 plato'], ['Pechuga de pollo', '1'], ['Coca-Cola Zero', '1 lata', 'drink']),
  t(undefined, ['Paella', '1 plato'], ['Ensalada mixta', '1 plato pequeño'], ['Agua', '2 vasos', 'drink']),
  t(undefined, ['Merluza al horno', '1 filete'], ['Patatas cocidas', '2'], ['Agua', '1 vaso', 'drink']),
  t(undefined, ['Tortilla de patatas', '1 porción'], ['Ensalada de tomate', '1 plato'], ['Pan', '1 trozo'], ['Agua', '1 vaso', 'drink']),
  t(undefined, ['Arroz con verduras', '1 plato'], ['Filete de ternera', '1'], ['Agua con gas', '1 vaso', 'drink']),
  t('ensalada', ['Ensalada de pasta', '1 plato'], ['Pollo asado', '1 muslo'], ['Agua', '1 vaso', 'drink']),
  t(undefined, ['Garbanzos con espinacas', '1 plato'], ['Pan', '1 trozo'], ['Flan', '1'], ['Agua', '1 vaso', 'drink']),
  t(undefined, ['Macarrones con carne', '1 plato'], ['Ensalada verde', '1 plato pequeño'], ['Cerveza sin alcohol', '1 caña', 'drink']),
];

const SNACKS: Template[] = [
  t('yogur', ['Yogur natural', '1']),
  t(undefined, ['Tostada con jamón', '1'], ['Té', '1 taza', 'drink']),
  t(undefined, ['Mandarinas', '2']),
  t(undefined, ['Galletas', '3'], ['Café con leche', '1 taza', 'drink']),
  t(undefined, ['Bocadillo pequeño de queso', '1']),
  t(undefined, ['Kiwi', '2']),
];

const DINNERS: Template[] = [
  t(undefined, ['Tortilla francesa', '2 huevos'], ['Ensalada', '1 plato'], ['Agua', '1 vaso', 'drink']),
  t(undefined, ['Crema de calabacín', '1 bol'], ['Queso fresco', '1 tarrina'], ['Agua', '1 vaso', 'drink']),
  t('pizza', ['Pizza margarita', '3 porciones'], ['Coca-Cola Zero', '1 lata', 'drink']),
  t(undefined, ['Pescado a la plancha', '1 filete'], ['Verduras salteadas', '1 plato'], ['Agua', '1 vaso', 'drink']),
  t(undefined, ['Sándwich mixto', '1'], ['Yogur', '1'], ['Agua', '1 vaso', 'drink']),
  t(undefined, ['Sopa de fideos', '1 plato'], ['Huevo cocido', '1'], ['Pan', '1 trozo']),
  t(undefined, ['Hamburguesa casera', '1'], ['Patatas al horno', '1 ración'], ['Cerveza sin alcohol', '1 botellín', 'drink']),
  t('pizza', ['Pizza de jamón y champiñones', '2 porciones'], ['Ensalada', '1 plato pequeño'], ['Agua', '1 vaso', 'drink']),
  t(undefined, ['Bocadillo de atún', '1'], ['Agua', '1 vaso', 'drink']),
];

const DRINKS: Template[] = [
  t(undefined, ['Agua', '500 ml', 'drink']),
  t(undefined, ['Infusión de manzanilla', '1 taza', 'drink']),
  t(undefined, ['Agua con gas', '1 vaso', 'drink']),
  t(undefined, ['Café solo', '1 taza', 'drink']),
];

const NOTES = [
  'Comida en casa de mi madre.',
  'Con prisa en el trabajo.',
  'Comí fuera, en un restaurante.',
  'Me apetecía algo caliente.',
  'Raciones más pequeñas de lo habitual.',
  'Cena tarde por el horario.',
];

const SYMPTOM_SETS: { symptoms: SymptomCode[]; note: string; other?: string }[] = [
  { symptoms: ['hinchazon'], note: 'Algo de hinchazón una hora después.' },
  { symptoms: ['acidez'], note: 'Un poco de acidez por la noche.' },
  { symptoms: ['dolor_abdominal'], note: 'Molestia leve en el abdomen.' },
  { symptoms: ['hinchazon', 'dolor_abdominal'], note: 'Hinchazón y algo de dolor después de comer.' },
  { symptoms: ['nauseas'], note: 'Ligeras náuseas al terminar.' },
  { symptoms: ['otros'], note: 'Cansancio después de comer.', other: 'Cansancio' },
];

interface Planned {
  time: string;
  mealType: MealType;
  template: Template;
  notes?: string;
  symptoms?: SymptomCode[];
  feelingNote?: string;
  otherSymptoms?: string;
}

/** Generador pseudoaleatorio determinista (mulberry32). */
function createRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Días fijos que coinciden con los ejemplos de la especificación.
const TODAY_FIXTURE: Planned[] = [
  { time: '08:32', mealType: 'desayuno', template: BREAKFASTS[0], symptoms: ['sin_sintomas'] },
  { time: '11:47', mealType: 'media_manana', template: t('fruta', ['Plátano', '1'], ['Agua', '500 ml', 'drink']) },
  {
    time: '14:36',
    mealType: 'comida',
    template: LUNCHES[1],
    symptoms: ['hinchazon'],
    feelingNote: 'Algo de hinchazón a media tarde.',
  },
  { time: '17:55', mealType: 'merienda', template: t(undefined, ['Yogur natural', '1'], ['Té', '1 taza', 'drink']) },
  { time: '21:40', mealType: 'cena', template: t(undefined, ['Crema de calabacín', '1 bol'], ['Tortilla francesa', '1']) },
];

const TUESDAY_FIXTURE: Planned[] = [
  { time: '08:12', mealType: 'desayuno', template: t(undefined, ['Café con leche', '1 taza', 'drink'], ['Tostada', '1']) },
  { time: '11:20', mealType: 'media_manana', template: t(undefined, ['Plátano', '1']) },
  { time: '14:42', mealType: 'comida', template: t(undefined, ['Pasta con pollo', '1 plato']), symptoms: ['sin_sintomas'] },
  { time: '18:10', mealType: 'merienda', template: t(undefined, ['Yogur', '1']) },
  { time: '22:05', mealType: 'cena', template: t(undefined, ['Bocadillo', '1'], ['Agua', '1 vaso', 'drink']) },
];

function planDay(date: string, offset: number): Planned[] {
  if (offset === 0) return TODAY_FIXTURE;
  if (offset === -2) return TUESDAY_FIXTURE;
  const rand = createRandom(`comida-amor:${date}`);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const jitter = (base: string, spread: number) => minutesToTime(timeToMinutes(base) + Math.round((rand() - 0.5) * 2 * spread));
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 domingo, 5 viernes, 6 sábado
  const plan: Planned[] = [];
  plan.push({ time: jitter('08:25', 30), mealType: 'desayuno', template: pick(BREAKFASTS) });
  if (rand() < 0.7) plan.push({ time: jitter('11:30', 30), mealType: 'media_manana', template: pick(MID_MORNING) });
  plan.push({ time: jitter('14:35', 30), mealType: 'comida', template: pick(LUNCHES) });
  if (rand() < 0.65) plan.push({ time: jitter('17:50', 35), mealType: 'merienda', template: pick(SNACKS) });
  const pizzaNight = weekday === 5 || (weekday === 6 && rand() < 0.5);
  plan.push({
    time: jitter('21:30', 30),
    mealType: 'cena',
    template: pizzaNight ? DINNERS[rand() < 0.5 ? 2 : 7] : pick(DINNERS.filter((d) => d.photo !== 'pizza')),
  });
  if (rand() < 0.45) plan.push({ time: jitter('16:15', 40), mealType: 'bebida', template: DRINKS[0] });
  if (rand() < 0.3) plan.push({ time: jitter('23:05', 15), mealType: 'bebida', template: DRINKS[1] });
  if (rand() < 0.1) plan.push({ time: jitter('12:30', 20), mealType: 'snack', template: t(undefined, ['Puñado de nueces', '1 puñado']) });

  for (const entry of plan) {
    if (entry.mealType === 'comida' || entry.mealType === 'cena') {
      const r = rand();
      if (r < 0.14) {
        const set = pick(SYMPTOM_SETS);
        entry.symptoms = set.symptoms;
        entry.feelingNote = set.note;
        entry.otherSymptoms = set.other;
      } else if (r < 0.4) {
        entry.symptoms = ['sin_sintomas'];
      }
    }
    if (rand() < 0.08) entry.notes = pick(NOTES);
  }
  return plan.sort((a, b) => a.time.localeCompare(b.time));
}

export function seedDemoData(ctx: AppContext, userId: string, options: { today: string; now: string; days?: number }): number {
  const days = options.days ?? 45;
  deleteAllEntries(ctx.db, ctx.config.dataDir, userId);

  const photoCache = new Map<string, { full: Buffer; thumb?: Buffer }>();
  const loadPhoto = (name: string) => {
    if (!photoCache.has(name)) {
      const full = path.join(ctx.config.seedPhotosDir, `${name}.jpg`);
      const thumb = path.join(ctx.config.seedPhotosDir, `${name}_thumb.jpg`);
      if (!fs.existsSync(full)) return null;
      photoCache.set(name, { full: fs.readFileSync(full), thumb: fs.existsSync(thumb) ? fs.readFileSync(thumb) : undefined });
    }
    return photoCache.get(name)!;
  };

  let created = 0;
  for (let offset = -(days - 1); offset <= 0; offset += 1) {
    const date = addDays(options.today, offset);
    for (const planned of planDay(date, offset)) {
      if (offset === 0 && planned.time > options.now) continue;
      const photoIds: string[] = [];
      // Fotos solo en algunos registros: los de hoy y, en las últimas semanas, uno de cada tres días.
      if (planned.template.photo && (offset === 0 || (offset >= -21 && Math.abs(offset) % 3 === 0))) {
        const photo = loadPhoto(planned.template.photo);
        if (photo) {
          const row = savePhoto(ctx.db, ctx.config.dataDir, userId, {
            full: photo.full,
            fullMime: 'image/jpeg',
            thumb: photo.thumb,
            thumbMime: photo.thumb ? 'image/jpeg' : null,
            width: 1200,
            height: 900,
          });
          photoIds.push(row.id);
        }
      }
      const input: EntryInputParsed = {
        eatenAt: `${date}T${planned.time}`,
        mealType: planned.mealType,
        items: planned.template.items.map(([name, quantity, kind]) => ({ name, quantity, kind: kind ?? 'food' })),
        notes: planned.notes ?? '',
        feelingNote: planned.feelingNote ?? '',
        symptoms: planned.symptoms ?? [],
        otherSymptoms: planned.otherSymptoms ?? '',
        photoIds,
      };
      createEntry(ctx.db, ctx.config.dataDir, userId, input);
      created += 1;
    }
  }
  return created;
}
