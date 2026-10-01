// Consultas de solo lectura: calendario, sugerencias, lista de alimentos y estadísticas.
// Las estadísticas son descriptivas: cuentan y ordenan, nunca valoran ni relacionan.

import type { DB } from '../db';
import { MEAL_TYPE_IDS, type ItemKind, type MealType, type SymptomCode } from '../../../shared/constants';
import { daysInclusive, eachDay, minutesToTime, timeToMinutes } from '../../../shared/dates';
import type {
  CalendarResponse,
  FoodOption,
  MealTimeStat,
  StatsResponse,
  SuggestionItem,
  SuggestionMeal,
  SuggestionsResponse,
} from '../../../shared/types';

export function calendarSummary(db: DB, userId: string, from: string, to: string): CalendarResponse {
  const rows = db
    .prepare(
      `SELECT substr(eaten_at, 1, 10) AS day, COUNT(*) AS count, group_concat(meal_type) AS types
       FROM entries WHERE user_id = ? AND eaten_at >= ? AND eaten_at <= ?
       GROUP BY day`,
    )
    .all(userId, `${from}T00:00`, `${to}T23:59`) as { day: string; count: number; types: string }[];
  const days: CalendarResponse['days'] = {};
  for (const row of rows) {
    const types = Array.from(new Set(row.types.split(','))) as MealType[];
    days[row.day] = { count: row.count, mealTypes: MEAL_TYPE_IDS.filter((t) => types.includes(t)) };
  }
  return { days };
}

interface ItemUsageRow {
  name: string;
  name_norm: string;
  kind: ItemKind;
  quantity: string;
  eaten_at: string;
}

/**
 * Sugerencias para el registro rápido: alimentos que suele tomar a esta hora y
 * los más recientes, además de las últimas comidas completas para repetirlas.
 */
export function suggestions(db: DB, userId: string, time: string | undefined, today: string): SuggestionsResponse {
  const usage = db
    .prepare(
      `SELECT i.name, i.name_norm, i.kind, i.quantity, e.eaten_at
       FROM entry_items i JOIN entries e ON e.id = i.entry_id
       WHERE i.user_id = ?
       ORDER BY e.eaten_at DESC
       LIMIT 4000`,
    )
    .all(userId) as ItemUsageRow[];

  const target = time ? timeToMinutes(time) : null;
  const byName = new Map<string, SuggestionItem & { near: number }>();
  for (const row of usage) {
    let item = byName.get(row.name_norm);
    if (!item) {
      item = { name: row.name, nameNorm: row.name_norm, kind: row.kind, quantity: row.quantity, count: 0, lastAt: row.eaten_at, near: 0 };
      byName.set(row.name_norm, item);
    }
    item.count += 1;
    if (target !== null) {
      const diff = Math.abs(timeToMinutes(row.eaten_at.slice(11, 16)) - target);
      if (Math.min(diff, 1440 - diff) <= 90) item.near += 1;
    }
  }
  const recentCutoff = today ? `${shiftDate(today, -7)}T00:00` : '';
  const ranked = Array.from(byName.values())
    .map((item) => ({ item, score: item.near * 3 + Math.min(item.count, 12) + (item.lastAt >= recentCutoff ? 4 : 0) }))
    .sort((a, b) => b.score - a.score || b.item.lastAt.localeCompare(a.item.lastAt))
    .slice(0, 18)
    .map(({ item: { near: _near, ...rest } }) => rest);

  const recentEntries = db
    .prepare('SELECT id, meal_type, eaten_at FROM entries WHERE user_id = ? ORDER BY eaten_at DESC LIMIT 60')
    .all(userId) as { id: string; meal_type: MealType; eaten_at: string }[];
  const meals: SuggestionMeal[] = [];
  const seen = new Set<string>();
  const itemsStmt = db.prepare('SELECT name, name_norm, quantity, kind FROM entry_items WHERE entry_id = ? ORDER BY position');
  for (const entry of recentEntries) {
    const items = itemsStmt.all(entry.id) as { name: string; name_norm: string; quantity: string; kind: ItemKind }[];
    if (items.length < 2) continue; // las comidas de un solo elemento ya salen como alimento suelto
    const signature = items.map((i) => i.name_norm).sort().join('|');
    if (seen.has(signature)) continue;
    seen.add(signature);
    meals.push({
      mealType: entry.meal_type,
      items: items.map(({ name, quantity, kind }) => ({ name, quantity, kind })),
      lastAt: entry.eaten_at,
    });
    if (meals.length >= 6) break;
  }
  return { items: ranked, meals };
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Alimentos y bebidas distintos que ha registrado (para filtros y autocompletado). */
export function foodOptions(db: DB, userId: string): FoodOption[] {
  const rows = db
    .prepare(
      `SELECT i.name_norm AS nameNorm, COUNT(*) AS count,
              (SELECT i2.name FROM entry_items i2 WHERE i2.user_id = i.user_id AND i2.name_norm = i.name_norm LIMIT 1) AS name,
              (SELECT i3.kind FROM entry_items i3 WHERE i3.user_id = i.user_id AND i3.name_norm = i.name_norm
               GROUP BY i3.kind ORDER BY COUNT(*) DESC LIMIT 1) AS kind
       FROM entry_items i WHERE i.user_id = ?
       GROUP BY i.name_norm ORDER BY count DESC, nameNorm ASC LIMIT 1000`,
    )
    .all(userId) as FoodOption[];
  return rows;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function entryDateBounds(db: DB, userId: string): { min: string | null; max: string | null } {
  const row = db
    .prepare('SELECT MIN(substr(eaten_at, 1, 10)) AS min, MAX(substr(eaten_at, 1, 10)) AS max FROM entries WHERE user_id = ?')
    .get(userId) as { min: string | null; max: string | null };
  return row;
}

export function computeStats(db: DB, userId: string, from: string, to: string): StatsResponse {
  const range = [`${from}T00:00`, `${to}T23:59`];
  const entries = db
    .prepare('SELECT id, eaten_at, meal_type, symptoms FROM entries WHERE user_id = ? AND eaten_at >= ? AND eaten_at <= ?')
    .all(userId, ...range) as { id: string; eaten_at: string; meal_type: MealType; symptoms: string }[];
  const items = db
    .prepare(
      `SELECT i.name, i.name_norm, i.kind FROM entry_items i JOIN entries e ON e.id = i.entry_id
       WHERE e.user_id = ? AND e.eaten_at >= ? AND e.eaten_at <= ?`,
    )
    .all(userId, ...range) as { name: string; name_norm: string; kind: ItemKind }[];

  const perDayMap = new Map<string, number>();
  const byHour = Array.from({ length: 24 }, () => 0);
  const timesByType = new Map<MealType, number[]>();
  const symptomCounts = new Map<SymptomCode, number>();
  let entriesWithSymptoms = 0;
  let entriesWithoutSymptoms = 0;

  for (const entry of entries) {
    const day = entry.eaten_at.slice(0, 10);
    perDayMap.set(day, (perDayMap.get(day) ?? 0) + 1);
    const minutes = timeToMinutes(entry.eaten_at.slice(11, 16));
    byHour[Math.floor(minutes / 60)] += 1;
    const list = timesByType.get(entry.meal_type) ?? [];
    list.push(minutes);
    timesByType.set(entry.meal_type, list);
    let symptoms: SymptomCode[] = [];
    try {
      symptoms = JSON.parse(entry.symptoms);
    } catch {
      /* dato antiguo o corrupto: se ignora */
    }
    const real = symptoms.filter((s) => s !== 'sin_sintomas');
    if (real.length > 0) entriesWithSymptoms += 1;
    else if (symptoms.includes('sin_sintomas')) entriesWithoutSymptoms += 1;
    for (const s of real) symptomCounts.set(s, (symptomCounts.get(s) ?? 0) + 1);
  }

  const mealTimes: MealTimeStat[] = [];
  for (const type of MEAL_TYPE_IDS) {
    const times = (timesByType.get(type) ?? []).sort((a, b) => a - b);
    if (times.length === 0) continue;
    mealTimes.push({
      mealType: type,
      count: times.length,
      median: minutesToTime(percentile(times, 0.5)),
      p25: minutesToTime(percentile(times, 0.25)),
      p75: minutesToTime(percentile(times, 0.75)),
      earliest: minutesToTime(times[0]),
      latest: minutesToTime(times[times.length - 1]),
    });
  }

  const tally = (kind: ItemKind) => {
    const map = new Map<string, { name: string; count: number }>();
    for (const item of items) {
      if (item.kind !== kind) continue;
      const current = map.get(item.name_norm) ?? { name: item.name, count: 0 };
      current.count += 1;
      map.set(item.name_norm, current);
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'))
      .slice(0, 10);
  };

  const days = daysInclusive(from, to) > 0 ? eachDay(from, to) : [];
  const daysWithEntries = perDayMap.size;
  return {
    from,
    to,
    daysInRange: days.length,
    daysWithEntries,
    totalEntries: entries.length,
    totalDrinks: items.filter((i) => i.kind === 'drink').length,
    avgEntriesPerDay: daysWithEntries > 0 ? Math.round((entries.length / daysWithEntries) * 10) / 10 : 0,
    perDay: days.map((date) => ({ date, count: perDayMap.get(date) ?? 0 })),
    byHour,
    mealTimes,
    topFoods: tally('food'),
    topDrinks: tally('drink'),
    symptoms: Array.from(symptomCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
    entriesWithSymptoms,
    entriesWithoutSymptoms,
  };
}
