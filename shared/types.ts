// Tipos de datos que viajan entre el cliente y la API.

import type { ItemKind, MealType, SymptomCode } from './constants';

export interface EntryItem {
  id?: string;
  name: string;
  quantity: string;
  kind: ItemKind;
}

export interface EntryPhoto {
  id: string;
  url: string;
  thumbUrl: string;
  width: number | null;
  height: number | null;
}

export interface Entry {
  id: string;
  /** Fecha y hora local en formato "YYYY-MM-DDTHH:MM". */
  eatenAt: string;
  mealType: MealType;
  items: EntryItem[];
  notes: string;
  feelingNote: string;
  symptoms: SymptomCode[];
  otherSymptoms: string;
  photos: EntryPhoto[];
  createdAt: string;
  updatedAt: string;
}

export interface EntryInput {
  eatenAt: string;
  mealType: MealType;
  items: Omit<EntryItem, 'id'>[];
  notes?: string;
  feelingNote?: string;
  symptoms?: SymptomCode[];
  otherSymptoms?: string;
  photoIds?: string[];
}

export interface EntryListResponse {
  entries: Entry[];
  total: number;
  dayCount: number;
  hasMore: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  isDemo: boolean;
  timezone: string;
  createdAt: string;
}

export interface CalendarDay {
  count: number;
  mealTypes: MealType[];
}

export interface CalendarResponse {
  days: Record<string, CalendarDay>;
}

export interface SuggestionItem {
  name: string;
  nameNorm: string;
  kind: ItemKind;
  quantity: string;
  count: number;
  lastAt: string;
}

export interface SuggestionMeal {
  mealType: MealType;
  items: Omit<EntryItem, 'id'>[];
  lastAt: string;
}

export interface SuggestionsResponse {
  items: SuggestionItem[];
  meals: SuggestionMeal[];
}

export interface FoodOption {
  name: string;
  nameNorm: string;
  kind: ItemKind;
  count: number;
}

export interface MealTimeStat {
  mealType: MealType;
  count: number;
  /** Horas en formato "HH:MM". */
  median: string;
  earliest: string;
  latest: string;
  p25: string;
  p75: string;
}

export interface StatsResponse {
  from: string;
  to: string;
  daysInRange: number;
  daysWithEntries: number;
  totalEntries: number;
  totalDrinks: number;
  avgEntriesPerDay: number;
  perDay: { date: string; count: number }[];
  byHour: number[];
  mealTimes: MealTimeStat[];
  topFoods: { name: string; count: number }[];
  topDrinks: { name: string; count: number }[];
  symptoms: { code: SymptomCode; count: number }[];
  entriesWithSymptoms: number;
  entriesWithoutSymptoms: number;
}

export interface ReminderTime {
  id: string;
  time: string;
  enabled: boolean;
}

export interface ReminderSettings {
  enabled: boolean;
  quietMinutes: number;
  times: ReminderTime[];
  pushConfigured: boolean;
  publicKey: string | null;
  subscriptions: number;
}
