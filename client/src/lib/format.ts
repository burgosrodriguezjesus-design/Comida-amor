import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { addDays } from '@shared/dates';
import { capitalizeFirst } from '@shared/text';

/** Convierte "YYYY-MM-DD" en un Date local (mediodía para evitar saltos de horario). */
export function toDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function toDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Jueves, 1 de octubre" */
export function longDate(value: string): string {
  return capitalizeFirst(format(toDate(value), "EEEE, d 'de' MMMM", { locale: es }));
}

/** "Jueves, 1 de octubre de 2026" */
export function longDateWithYear(value: string): string {
  return capitalizeFirst(format(toDate(value), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es }));
}

/** "1 de octubre" */
export function dayMonth(value: string): string {
  return format(toDate(value), "d 'de' MMMM", { locale: es });
}

/** "1 oct" */
export function shortDate(value: string): string {
  return format(toDate(value), 'd MMM', { locale: es }).replace('.', '');
}

/** "01/10/2026" */
export function numericDate(value: string): string {
  return format(toDate(value), 'dd/MM/yyyy');
}

/** "Octubre de 2026" */
export function monthYear(value: string): string {
  return capitalizeFirst(format(toDate(value), "MMMM 'de' yyyy", { locale: es }));
}

export function weekdayShort(value: string): string {
  return capitalizeFirst(format(toDate(value), 'EEE', { locale: es }).replace('.', ''));
}

/** "Hoy", "Ayer" o "Martes, 29 de septiembre". */
export function relativeDayLabel(value: string, today: string): string {
  if (value === today) return 'Hoy';
  if (value === addDays(today, -1)) return 'Ayer';
  if (value === addDays(today, 1)) return 'Mañana';
  return value.slice(0, 4) === today.slice(0, 4) ? longDate(value) : longDateWithYear(value);
}

export function greeting(time: string): string {
  const hour = Number(time.slice(0, 2));
  if (hour >= 6 && hour < 13) return 'Buenos días';
  if (hour >= 13 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Lunes de la semana de una fecha. */
export function startOfWeek(value: string): string {
  const day = toDate(value).getDay(); // 0 = domingo
  return addDays(value, day === 0 ? -6 : 1 - day);
}

export function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function endOfMonth(value: string): string {
  const [y, m] = value.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${value.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

export function addMonths(value: string, months: number): string {
  const [y, m] = value.split('-').map(Number);
  const date = new Date(y, m - 1 + months, 1, 12);
  return toDateString(date);
}
