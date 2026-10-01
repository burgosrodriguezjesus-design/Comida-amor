// Utilidades de fechas sobre cadenas "YYYY-MM-DD" y "HH:MM" (hora local de la usuaria).
// Se trabaja con cadenas para que el día de cada registro no dependa de zonas horarias.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function isValidDateTime(value: string): boolean {
  const [date, time] = value.split('T');
  return value.length === 16 && isValidDate(date ?? '') && isValidTime(time ?? '');
}

function toUtcDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const date = toUtcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtcDate(date);
}

/** Número de días entre dos fechas, ambos incluidos. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000) + 1;
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Fecha y hora local de un objeto Date en el navegador. */
export function localDateTimeParts(date: Date): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

/** Fecha y hora actuales en una zona horaria IANA concreta (se usa en el servidor). */
export function nowInTimeZone(timeZone: string, now = new Date()): { date: string; time: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
  } catch {
    return localDateTimeParts(now);
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
