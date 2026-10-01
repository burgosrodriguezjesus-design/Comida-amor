// Constantes compartidas entre el cliente y el servidor.

export const MEAL_TYPES = [
  { id: 'desayuno', label: 'Desayuno' },
  { id: 'media_manana', label: 'Media mañana' },
  { id: 'comida', label: 'Comida' },
  { id: 'merienda', label: 'Merienda' },
  { id: 'cena', label: 'Cena' },
  { id: 'snack', label: 'Snack' },
  { id: 'bebida', label: 'Bebida' },
  { id: 'otro', label: 'Otro' },
] as const;

export type MealType = (typeof MEAL_TYPES)[number]['id'];

export const MEAL_TYPE_IDS = MEAL_TYPES.map((m) => m.id) as [MealType, ...MealType[]];

export const MEAL_TYPE_LABELS: Record<MealType, string> = Object.fromEntries(
  MEAL_TYPES.map((m) => [m.id, m.label]),
) as Record<MealType, string>;

export const SYMPTOMS = [
  { id: 'sin_sintomas', label: 'Sin síntomas' },
  { id: 'dolor_abdominal', label: 'Dolor abdominal' },
  { id: 'hinchazon', label: 'Hinchazón' },
  { id: 'nauseas', label: 'Náuseas' },
  { id: 'acidez', label: 'Acidez' },
  { id: 'diarrea', label: 'Diarrea' },
  { id: 'estrenimiento', label: 'Estreñimiento' },
  { id: 'otros', label: 'Otros síntomas' },
] as const;

export type SymptomCode = (typeof SYMPTOMS)[number]['id'];

export const SYMPTOM_IDS = SYMPTOMS.map((s) => s.id) as [SymptomCode, ...SymptomCode[]];

export const SYMPTOM_LABELS: Record<SymptomCode, string> = Object.fromEntries(
  SYMPTOMS.map((s) => [s.id, s.label]),
) as Record<SymptomCode, string>;

export const ITEM_KINDS = ['food', 'drink'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const LIMITS = {
  itemsPerEntry: 40,
  photosPerEntry: 6,
  itemName: 200,
  quantity: 80,
  notes: 2000,
  otherSymptoms: 300,
  photoBytes: 12 * 1024 * 1024,
  remindersPerUser: 8,
} as const;

/** Tipo de comida sugerido según la hora (horarios habituales en España). */
export function suggestMealTypeForTime(time: string): MealType {
  const [h, m] = time.split(':').map(Number);
  const minutes = h * 60 + m;
  if (minutes >= 5 * 60 && minutes < 10 * 60 + 30) return 'desayuno';
  if (minutes >= 10 * 60 + 30 && minutes < 13 * 60) return 'media_manana';
  if (minutes >= 13 * 60 && minutes < 16 * 60 + 30) return 'comida';
  if (minutes >= 16 * 60 + 30 && minutes < 20 * 60) return 'merienda';
  if (minutes >= 20 * 60) return 'cena';
  return 'snack';
}

/** Un síntoma "real" es cualquiera distinto de "Sin síntomas". */
export function hasRealSymptoms(symptoms: readonly string[]): boolean {
  return symptoms.some((s) => s !== 'sin_sintomas');
}

/** "Sin síntomas" es excluyente: si hay otros síntomas, se descarta. */
export function normalizeSymptoms(symptoms: readonly SymptomCode[], otherText = ''): SymptomCode[] {
  const unique = Array.from(new Set(symptoms));
  let result = unique;
  if (otherText.trim() && !result.includes('otros')) result = [...result, 'otros'];
  if (result.some((s) => s !== 'sin_sintomas')) result = result.filter((s) => s !== 'sin_sintomas');
  return SYMPTOM_IDS.filter((id) => result.includes(id));
}
