// Utilidades de texto compartidas: normalización para búsquedas,
// separación de alimentos en el registro rápido y detección de bebidas.

import type { ItemKind } from './constants';

/** Minúsculas, sin tildes y con espacios simplificados. "Café con Leche" -> "cafe con leche". */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    .trim();
}

/** Pone en mayúscula la primera letra sin tocar el resto. */
export function capitalizeFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase('es-ES') + trimmed.slice(1);
}

/**
 * Divide un texto libre del registro rápido en alimentos.
 * "Café con leche y un croissant" -> ["Café con leche", "Un croissant"]
 * Separa por comas, punto y coma, "+", saltos de línea y la conjunción " y ".
 */
export function splitFoods(text: string): string[] {
  return text
    .split(/\s*(?:,|;|\+|\n|\s+y\s+|\s+e\s+(?=[ií]))\s*/i)
    .map((part) => part.replace(/\.+$/, '').trim())
    .filter((part) => part.length > 0)
    .map(capitalizeFirst);
}

const DRINK_WORDS = new Set([
  'agua', 'aguas', 'cafe', 'cafes', 'cafelito', 'cortado', 'capuchino', 'cappuccino', 'expreso', 'espresso',
  'descafeinado', 'americano', 'te', 'infusion', 'infusiones', 'manzanilla', 'tila', 'poleo', 'rooibos',
  'zumo', 'zumos', 'jugo', 'leche', 'batido', 'batidos', 'smoothie', 'refresco', 'refrescos', 'coca',
  'cocacola', 'pepsi', 'fanta', 'sprite', 'aquarius', 'nestea', 'cerveza', 'cervezas', 'cana', 'canas',
  'clara', 'vino', 'tinto', 'cava', 'champan', 'sidra', 'gaseosa', 'tonica', 'kombucha', 'horchata',
  'colacao', 'cacaolat', 'limonada', 'granizado', 'mosto', 'vermut', 'vermu', 'sangria', 'whisky', 'ron',
  'ginebra', 'gin', 'licor', 'chupito', 'isotonica', 'bebida', 'bebidas', 'gatorade', 'powerade', 'redbull',
  'monster', 'bitter', 'kefir', 'chocolate caliente', 'cola cao', 'red bull', 'mate', 'yogur liquido',
  'bebida vegetal', 'leche de avena', 'leche de soja', 'leche de almendras', 'caldo',
]);

const LEADING_NOISE = new Set([
  'un', 'una', 'unos', 'unas', 'dos', 'tres', 'cuatro', 'medio', 'media', 'mi', 'el', 'la', 'los', 'las',
  'vaso', 'vasos', 'vasito', 'taza', 'tazas', 'tazon', 'botella', 'botellas', 'botellin', 'lata', 'latas',
  'copa', 'copas', 'jarra', 'brick', 'tetrabrik', 'ml', 'l', 'cl', 'litro', 'litros', 'de', 'del', 'grande',
  'pequeno', 'pequena', 'poco', 'sorbo', 'trago', 'chupito',
]);

/**
 * Intenta adivinar si un elemento es una bebida mirando sus primeras palabras
 * tras quitar cantidades y recipientes ("500 ml de agua" -> "agua").
 */
export function detectItemKind(name: string): ItemKind {
  const words = normalizeText(name)
    .replace(/[-_/]/g, ' ')
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .split(' ')
    .filter(Boolean);
  let index = 0;
  while (index < words.length && (LEADING_NOISE.has(words[index]) || /^\d+([.,]\d+)?(ml|l|cl)?$/.test(words[index]))) {
    index += 1;
  }
  const first = words[index];
  if (!first) return 'food';
  const pair = words.slice(index, index + 2).join(' ');
  const triple = words.slice(index, index + 3).join(' ');
  if (DRINK_WORDS.has(triple) || DRINK_WORDS.has(pair) || DRINK_WORDS.has(first)) return 'drink';
  return 'food';
}

/** Escapa los comodines de LIKE en SQLite (se usa con ESCAPE '\'). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
