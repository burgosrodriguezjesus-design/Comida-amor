// Consultas sobre registros en memoria. Hacen lo mismo que las consultas SQL del
// servidor y las usa la versión que funciona solo en el navegador.

import { MEAL_TYPE_IDS, MEAL_TYPE_LABELS, SYMPTOM_LABELS, type ItemKind, type MealType, type SymptomCode } from './constants';
import { addDays, daysInclusive, eachDay, minutesToTime, timeToMinutes } from './dates';
import { normalizeText } from './text';
import type {
  CalendarResponse,
  Entry,
  FoodOption,
  MealTimeStat,
  StatsResponse,
  SuggestionItem,
  SuggestionMeal,
  SuggestionsResponse,
} from './types';

export interface EntryQuery {
  from?: string;
  to?: string;
  q?: string;
  types?: MealType[];
  food?: string;
  symptoms?: boolean;
  photos?: boolean;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/** Texto normalizado para buscar sin tildes ni mayúsculas (igual que en el servidor). */
export function entrySearchText(entry: Pick<Entry, 'mealType' | 'items' | 'notes' | 'feelingNote' | 'symptoms' | 'otherSymptoms'>): string {
  const parts = [
    MEAL_TYPE_LABELS[entry.mealType],
    ...entry.items.flatMap((i) => [i.name, i.quantity]),
    entry.notes,
    entry.feelingNote,
    ...entry.symptoms.map((s) => SYMPTOM_LABELS[s]),
    entry.otherSymptoms,
  ];
  return normalizeText(parts.filter(Boolean).join(' · '));
}

const byTime = (order: 'asc' | 'desc') => (a: Entry, b: Entry) => {
  const cmp = a.eatenAt.localeCompare(b.eatenAt) || a.createdAt.localeCompare(b.createdAt);
  return order === 'asc' ? cmp : -cmp;
};

export function queryEntries(all: Entry[], query: EntryQuery) {
  const words = query.q ? normalizeText(query.q).split(' ').filter(Boolean).slice(0, 8) : [];
  const food = query.food ? normalizeText(query.food) : '';
  const matched = all.filter((e) => {
    if (query.from && e.eatenAt < `${query.from}T00:00`) return false;
    if (query.to && e.eatenAt > `${query.to}T23:59`) return false;
    if (query.types?.length && !query.types.includes(e.mealType)) return false;
    if (food && !e.items.some((i) => normalizeText(i.name) === food)) return false;
    if (query.symptoms && !e.symptoms.some((s) => s !== 'sin_sintomas')) return false;
    if (query.photos && e.photos.length === 0) return false;
    if (words.length) {
      const text = entrySearchText(e);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
  matched.sort(byTime(query.order ?? 'desc'));
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 50;
  const page = matched.slice(offset, offset + limit);
  return {
    entries: page,
    total: matched.length,
    dayCount: new Set(matched.map((e) => e.eatenAt.slice(0, 10))).size,
    hasMore: offset + page.length < matched.length,
  };
}

export function calendarFromEntries(all: Entry[], from: string, to: string): CalendarResponse {
  const days: CalendarResponse['days'] = {};
  for (const e of all) {
    const day = e.eatenAt.slice(0, 10);
    if (day < from || day > to) continue;
    const current = days[day] ?? { count: 0, mealTypes: [] };
    current.count += 1;
    if (!current.mealTypes.includes(e.mealType)) current.mealTypes.push(e.mealType);
    days[day] = current;
  }
  for (const value of Object.values(days)) value.mealTypes = MEAL_TYPE_IDS.filter((t) => value.mealTypes.includes(t));
  return { days };
}

export function suggestionsFromEntries(all: Entry[], time: string | undefined, today: string): SuggestionsResponse {
  const sorted = [...all].sort(byTime('desc'));
  const target = time ? timeToMinutes(time) : null;
  const byName = new Map<string, SuggestionItem & { near: number }>();
  let rows = 0;
  for (const entry of sorted) {
    for (const item of entry.items) {
      if (rows >= 4000) break;
      rows += 1;
      const norm = normalizeText(item.name);
      let current = byName.get(norm);
      if (!current) {
        current = { name: item.name, nameNorm: norm, kind: item.kind, quantity: item.quantity, count: 0, lastAt: entry.eatenAt, near: 0 };
        byName.set(norm, current);
      }
      current.count += 1;
      if (target !== null) {
        const diff = Math.abs(timeToMinutes(entry.eatenAt.slice(11, 16)) - target);
        if (Math.min(diff, 1440 - diff) <= 90) current.near += 1;
      }
    }
  }
  const recentCutoff = today ? `${addDays(today, -7)}T00:00` : '';
  const items = Array.from(byName.values())
    .map((item) => ({ item, score: item.near * 3 + Math.min(item.count, 12) + (item.lastAt >= recentCutoff ? 4 : 0) }))
    .sort((a, b) => b.score - a.score || b.item.lastAt.localeCompare(a.item.lastAt))
    .slice(0, 18)
    .map(({ item: { near: _near, ...rest } }) => rest);

  const meals: SuggestionMeal[] = [];
  const seen = new Set<string>();
  for (const entry of sorted.slice(0, 60)) {
    if (entry.items.length < 2) continue;
    const signature = entry.items.map((i) => normalizeText(i.name)).sort().join('|');
    if (seen.has(signature)) continue;
    seen.add(signature);
    meals.push({
      mealType: entry.mealType,
      items: entry.items.map(({ name, quantity, kind }) => ({ name, quantity, kind })),
      lastAt: entry.eatenAt,
    });
    if (meals.length >= 6) break;
  }
  return { items, meals };
}

export function foodOptionsFromEntries(all: Entry[]): FoodOption[] {
  const map = new Map<string, { name: string; count: number; kinds: Record<ItemKind, number> }>();
  for (const entry of all) {
    for (const item of entry.items) {
      const norm = normalizeText(item.name);
      const current = map.get(norm) ?? { name: item.name, count: 0, kinds: { food: 0, drink: 0 } };
      current.count += 1;
      current.kinds[item.kind] += 1;
      map.set(norm, current);
    }
  }
  return Array.from(map.entries())
    .map(([nameNorm, v]) => ({ name: v.name, nameNorm, count: v.count, kind: (v.kinds.drink > v.kinds.food ? 'drink' : 'food') as ItemKind }))
    .sort((a, b) => b.count - a.count || a.nameNorm.localeCompare(b.nameNorm))
    .slice(0, 1000);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function statsFromEntries(all: Entry[], from: string, to: string): StatsResponse {
  const entries = all.filter((e) => e.eatenAt >= `${from}T00:00` && e.eatenAt <= `${to}T23:59`);
  const perDayMap = new Map<string, number>();
  const byHour = Array.from({ length: 24 }, () => 0);
  const timesByType = new Map<MealType, number[]>();
  const symptomCounts = new Map<SymptomCode, number>();
  let entriesWithSymptoms = 0;
  let entriesWithoutSymptoms = 0;
  for (const entry of entries) {
    const day = entry.eatenAt.slice(0, 10);
    perDayMap.set(day, (perDayMap.get(day) ?? 0) + 1);
    const minutes = timeToMinutes(entry.eatenAt.slice(11, 16));
    byHour[Math.floor(minutes / 60)] += 1;
    timesByType.set(entry.mealType, [...(timesByType.get(entry.mealType) ?? []), minutes]);
    const real = entry.symptoms.filter((s) => s !== 'sin_sintomas');
    if (real.length > 0) entriesWithSymptoms += 1;
    else if (entry.symptoms.includes('sin_sintomas')) entriesWithoutSymptoms += 1;
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
    for (const entry of entries) {
      for (const item of entry.items) {
        if (item.kind !== kind) continue;
        const norm = normalizeText(item.name);
        const current = map.get(norm) ?? { name: item.name, count: 0 };
        current.count += 1;
        map.set(norm, current);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'))
      .slice(0, 10);
  };
  const days = daysInclusive(from, to) > 0 ? eachDay(from, to) : [];
  const totalEntries = entries.length;
  return {
    from,
    to,
    daysInRange: days.length,
    daysWithEntries: perDayMap.size,
    totalEntries,
    totalDrinks: entries.reduce((n, e) => n + e.items.filter((i) => i.kind === 'drink').length, 0),
    avgEntriesPerDay: perDayMap.size > 0 ? Math.round((totalEntries / perDayMap.size) * 10) / 10 : 0,
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
