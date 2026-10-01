import { describe, expect, it } from 'vitest';
import { normalizeSymptoms, suggestMealTypeForTime } from './constants';
import { addDays, daysInclusive, isValidDateTime, nowInTimeZone } from './dates';
import { detectItemKind, normalizeText, splitFoods } from './text';

describe('texto', () => {
  it('normaliza tildes y mayúsculas', () => {
    expect(normalizeText('  Café   con LECHE ')).toBe('cafe con leche');
    expect(normalizeText('Piña')).toBe('pina');
  });

  it('separa alimentos del registro rápido', () => {
    expect(splitFoods('Café con leche y un croissant')).toEqual(['Café con leche', 'Un croissant']);
    expect(splitFoods('pasta, pollo + coca-cola zero')).toEqual(['Pasta', 'Pollo', 'Coca-cola zero']);
    expect(splitFoods('  ')).toEqual([]);
  });

  it('detecta bebidas', () => {
    for (const drink of ['Café con leche', 'Agua', '500 ml de agua', 'Un vaso de leche', 'Coca-Cola Zero', 'Zumo de naranja', 'Té verde', 'Infusión de manzanilla', 'cerveza sin alcohol']) {
      expect(detectItemKind(drink), drink).toBe('drink');
    }
    for (const food of ['Arroz con leche', 'Tostadas con aceite', 'Plátano', 'Pan con tomate', 'Tomate', 'Pasta']) {
      expect(detectItemKind(food), food).toBe('food');
    }
  });
});

describe('fechas y tipos', () => {
  it('sugiere el tipo de comida por la hora', () => {
    expect(suggestMealTypeForTime('08:30')).toBe('desayuno');
    expect(suggestMealTypeForTime('11:47')).toBe('media_manana');
    expect(suggestMealTypeForTime('14:36')).toBe('comida');
    expect(suggestMealTypeForTime('18:00')).toBe('merienda');
    expect(suggestMealTypeForTime('21:30')).toBe('cena');
    expect(suggestMealTypeForTime('02:00')).toBe('snack');
  });

  it('opera con fechas sin depender de la zona horaria', () => {
    expect(addDays('2026-10-01', -2)).toBe('2026-09-29');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(daysInclusive('2026-09-25', '2026-10-01')).toBe(7);
    expect(isValidDateTime('2026-10-01T08:32')).toBe(true);
    expect(isValidDateTime('2026-13-01T08:32')).toBe(false);
    expect(nowInTimeZone('Europe/Madrid', new Date('2026-10-01T22:30:00Z'))).toEqual({ date: '2026-10-02', time: '00:30' });
  });

  it('"Sin síntomas" se descarta si hay otros', () => {
    expect(normalizeSymptoms(['sin_sintomas'])).toEqual(['sin_sintomas']);
    expect(normalizeSymptoms(['sin_sintomas', 'acidez'])).toEqual(['acidez']);
    expect(normalizeSymptoms([], 'mareo')).toEqual(['otros']);
  });
});
