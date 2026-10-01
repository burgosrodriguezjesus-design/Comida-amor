// Borrador del formulario de comida: lo que la usuaria está escribiendo antes de guardar.

import { suggestMealTypeForTime, type ItemKind, type MealType, type SymptomCode } from '@shared/constants';
import type { Entry, EntryInput, EntryItem, EntryPhoto } from '@shared/types';
import { localDateTimeParts } from '@shared/dates';

export interface DraftItem {
  key: string;
  name: string;
  quantity: string;
}

export interface DraftPhoto extends Partial<EntryPhoto> {
  key: string;
  localUrl?: string;
  uploading?: boolean;
}

export interface Draft {
  id?: string;
  originalDate?: string;
  date: string;
  time: string;
  /** Si no se ha tocado la hora, se usa el momento exacto de guardar. */
  timeTouched: boolean;
  /** null = automático según la hora y lo que se ha escrito. */
  mealType: MealType | null;
  foods: DraftItem[];
  drinks: DraftItem[];
  photos: DraftPhoto[];
  notes: string;
  feelingNote: string;
  symptoms: SymptomCode[];
  otherSymptoms: string;
}

let counter = 0;
export const newKey = () => `k${Date.now().toString(36)}${(counter += 1)}`;

export const emptyItem = (): DraftItem => ({ key: newKey(), name: '', quantity: '' });

export function emptyDraft(overrides: Partial<Draft> = {}): Draft {
  const now = localDateTimeParts(new Date());
  return {
    date: now.date,
    time: now.time,
    timeTouched: false,
    mealType: null,
    foods: [emptyItem()],
    drinks: [],
    photos: [],
    notes: '',
    feelingNote: '',
    symptoms: [],
    otherSymptoms: '',
    ...overrides,
  };
}

export function itemsToDraftLists(items: Omit<EntryItem, 'id'>[]): Pick<Draft, 'foods' | 'drinks'> {
  const foods = items.filter((i) => i.kind === 'food').map((i) => ({ key: newKey(), name: i.name, quantity: i.quantity }));
  const drinks = items.filter((i) => i.kind === 'drink').map((i) => ({ key: newKey(), name: i.name, quantity: i.quantity }));
  return { foods: foods.length || !drinks.length ? foods : [], drinks };
}

export function draftFromEntry(entry: Entry): Draft {
  const [date, time] = entry.eatenAt.split('T');
  const lists = itemsToDraftLists(entry.items);
  return {
    id: entry.id,
    originalDate: date,
    date,
    time,
    timeTouched: true,
    mealType: entry.mealType,
    foods: lists.foods,
    drinks: lists.drinks,
    photos: entry.photos.map((p) => ({ ...p, key: p.id })),
    notes: entry.notes,
    feelingNote: entry.feelingNote,
    symptoms: entry.symptoms,
    otherSymptoms: entry.otherSymptoms,
  };
}

/** Copia de un registro para volver a apuntarlo ahora. */
export function draftRepeating(entry: Entry): Draft {
  const lists = itemsToDraftLists(entry.items);
  return emptyDraft({ mealType: null, foods: lists.foods.length ? lists.foods : [], drinks: lists.drinks });
}

export function autoMealType(time: string, items: { kind: ItemKind }[]): MealType {
  const byTime = suggestMealTypeForTime(time);
  if (items.length > 0 && items.every((i) => i.kind === 'drink') && byTime !== 'desayuno') return 'bebida';
  return byTime;
}

export function draftItems(draft: Pick<Draft, 'foods' | 'drinks'>): Omit<EntryItem, 'id'>[] {
  const clean = (list: DraftItem[], kind: ItemKind) =>
    list
      .filter((i) => i.name.trim())
      .map((i) => ({ name: i.name.trim(), quantity: i.quantity.trim(), kind }));
  return [...clean(draft.foods, 'food'), ...clean(draft.drinks, 'drink')];
}

export function effectiveMealType(draft: Draft): MealType {
  return draft.mealType ?? autoMealType(draft.time, draftItems(draft));
}

export function draftToInput(draft: Draft): EntryInput {
  let { date, time } = draft;
  if (!draft.timeTouched && !draft.id) ({ date, time } = localDateTimeParts(new Date()));
  return {
    eatenAt: `${date}T${time}`,
    mealType: draft.mealType ?? autoMealType(time, draftItems(draft)),
    items: draftItems(draft),
    notes: draft.notes.trim(),
    feelingNote: draft.feelingNote.trim(),
    symptoms: draft.symptoms,
    otherSymptoms: draft.symptoms.includes('otros') ? draft.otherSymptoms.trim() : '',
    photoIds: draft.photos.filter((p) => p.id && !p.uploading).map((p) => p.id!),
  };
}

export function draftHasContent(draft: Draft): boolean {
  return (
    draftItems(draft).length > 0 ||
    draft.photos.length > 0 ||
    draft.notes.trim() !== '' ||
    draft.feelingNote.trim() !== '' ||
    draft.symptoms.length > 0
  );
}

/** Desplaza fecha y hora un número de minutos (puede cambiar de día). */
export function shiftDateTime(date: string, time: string, minutes: number): { date: string; time: string } {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const value = new Date(y, m - 1, d, hh, mm + minutes);
  return localDateTimeParts(value);
}
