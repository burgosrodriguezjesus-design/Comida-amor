import clsx from 'clsx';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { addDays, eachDay, isValidDate } from '@shared/dates';
import type { Entry } from '@shared/types';
import { useCalendar, useDayEntries, useRangeEntries } from '@/api/hooks';
import { EntryRow, EntryTimeline } from '@/components/EntryCard';
import { SettingsLink } from '@/components/Layout';
import { Button, EmptyState, IconButton, PageHeader, Segmented, Spinner } from '@/components/ui';
import { useEntryEditor } from '@/context/EntryEditor';
import {
  addMonths,
  endOfMonth,
  longDate,
  monthYear,
  plural,
  relativeDayLabel,
  shortDate,
  startOfMonth,
  startOfWeek,
  toDate,
} from '@/lib/format';
import { useNow } from '@/lib/useNow';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

type View = 'mes' | 'semana';

/** Desliza a izquierda/derecha para cambiar de mes, semana o día. */
function useSwipe(onPrev: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return;
      const dx = e.changedTouches[0].clientX - start.current.x;
      const dy = e.changedTouches[0].clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx > 0 ? onPrev : onNext)();
    },
  };
}

export function CalendarPage() {
  const { date: today } = useNow();
  const [params, setParams] = useSearchParams();
  const paramDay = params.get('dia');
  const selected = paramDay && isValidDate(paramDay) ? paramDay : today;
  const view: View = params.get('vista') === 'semana' ? 'semana' : 'mes';
  const [month, setMonth] = useState(() => startOfMonth(selected));

  useEffect(() => {
    setMonth((m) => (selected.slice(0, 7) === m.slice(0, 7) ? m : startOfMonth(selected)));
  }, [selected]);

  const update = (next: { dia?: string; vista?: View }) => {
    const p = new URLSearchParams(params);
    if (next.dia) p.set('dia', next.dia);
    if (next.vista) p.set('vista', next.vista);
    setParams(p, { replace: true });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Calendario"
        subtitle="Toca un día para ver todo lo que registraste."
        actions={<SettingsLink />}
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Vista del calendario"
          value={view}
          onChange={(vista) => update({ vista })}
          options={[
            { value: 'mes', label: 'Mes' },
            { value: 'semana', label: 'Semana' },
          ]}
        />
        {selected !== today && (
          <Button variant="secondary" size="sm" onClick={() => update({ dia: today })}>
            Ir a hoy
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start">
        {view === 'mes' ? (
          <MonthView
            month={month}
            setMonth={setMonth}
            selected={selected}
            today={today}
            onSelect={(dia) => update({ dia })}
          />
        ) : (
          <WeekView selected={selected} today={today} onSelect={(dia) => update({ dia })} />
        )}
        <DayDetail date={selected} today={today} onNavigate={(dia) => update({ dia })} />
      </div>
    </div>
  );
}

function MonthView({
  month,
  setMonth,
  selected,
  today,
  onSelect,
}: {
  month: string;
  setMonth: (m: string) => void;
  selected: string;
  today: string;
  onSelect: (day: string) => void;
}) {
  const gridStart = startOfWeek(month);
  const gridEnd = addDays(startOfWeek(endOfMonth(month)), 6);
  const days = useMemo(() => eachDay(gridStart, gridEnd), [gridStart, gridEnd]);
  const calendar = useCalendar(gridStart, gridEnd);
  const swipe = useSwipe(() => setMonth(addMonths(month, -1)), () => setMonth(addMonths(month, 1)));
  const recordedDays = days.filter((d) => d.slice(0, 7) === month.slice(0, 7) && calendar.data?.days[d]).length;

  return (
    <section className="card p-4 sm:p-5" aria-label={`Calendario de ${monthYear(month)}`} {...swipe}>
      <div className="mb-3 flex items-center justify-between">
        <IconButton label="Mes anterior" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={22} />
        </IconButton>
        <div className="text-center">
          <h2 className="font-display text-xl font-semibold">{monthYear(month)}</h2>
          <p className="text-[13px] text-ink-3">{plural(recordedDays, 'día con registros', 'días con registros')}</p>
        </div>
        <IconButton label="Mes siguiente" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight size={22} />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className="pb-1 text-xs font-bold text-ink-3" role="columnheader" aria-label={WEEKDAY_NAMES[i]}>
            {d}
          </div>
        ))}
        {days.map((day) => {
          const info = calendar.data?.days[day];
          const inMonth = day.slice(0, 7) === month.slice(0, 7);
          const isSelected = day === selected;
          const isToday = day === today;
          const future = day > today;
          return (
            <button
              key={day}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={`${longDate(day)}${info ? `: ${plural(info.count, 'registro', 'registros')}` : ': sin registros'}`}
              onClick={() => onSelect(day)}
              className={clsx(
                'relative flex aspect-square flex-col items-center justify-center rounded-2xl text-[15px] transition-all duration-150 active:scale-95',
                isSelected ? 'bg-ink font-bold text-bg shadow-soft-sm' : 'hover:bg-surface-2',
                !inMonth && !isSelected && 'text-ink-3/60',
                future && !isSelected && 'text-ink-3',
                isToday && !isSelected && 'font-bold text-brand ring-2 ring-brand/40',
              )}
            >
              <span className="tabular-nums">{Number(day.slice(8))}</span>
              <span className="mt-0.5 flex h-1.5 gap-0.5" aria-hidden="true">
                {info &&
                  Array.from({ length: Math.min(info.count, 4) }, (_, i) => (
                    <span
                      key={i}
                      className={clsx('h-[5px] w-[5px] rounded-full', isSelected ? 'bg-bg/80' : 'bg-brand/70')}
                    />
                  ))}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-ink-3">Los puntos indican los registros del día (hasta 4). Desliza para cambiar de mes.</p>
    </section>
  );
}

function WeekView({ selected, today, onSelect }: { selected: string; today: string; onSelect: (day: string) => void }) {
  const weekStart = startOfWeek(selected);
  const weekEnd = addDays(weekStart, 6);
  const range = useRangeEntries(weekStart, weekEnd);
  const swipe = useSwipe(() => onSelect(addDays(selected, -7)), () => onSelect(addDays(selected, 7)));
  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of range.data ?? []) {
      const day = entry.eatenAt.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), entry]);
    }
    return map;
  }, [range.data]);

  return (
    <section className="card p-4 sm:p-5" aria-label="Semana" {...swipe}>
      <div className="mb-3 flex items-center justify-between">
        <IconButton label="Semana anterior" onClick={() => onSelect(addDays(selected, -7))}>
          <ChevronLeft size={22} />
        </IconButton>
        <h2 className="font-display text-xl font-semibold">
          {shortDate(weekStart)} – {shortDate(weekEnd)}
        </h2>
        <IconButton label="Semana siguiente" onClick={() => onSelect(addDays(selected, 7))}>
          <ChevronRight size={22} />
        </IconButton>
      </div>
      {range.isPending ? (
        <Spinner />
      ) : (
        <ol className="divide-y divide-line">
          {eachDay(weekStart, weekEnd).map((day) => {
            const entries = byDay.get(day) ?? [];
            return (
              <li key={day} className="py-3 first:pt-1 last:pb-0">
                <button
                  type="button"
                  onClick={() => onSelect(day)}
                  className={clsx(
                    'mb-1 flex w-full items-center justify-between rounded-xl px-2 py-1 text-left',
                    day === selected ? 'bg-brand-soft text-brand' : 'hover:bg-surface-2',
                  )}
                >
                  <span className="font-semibold">
                    {relativeDayLabel(day, today) === longDate(day) ? longDate(day) : `${relativeDayLabel(day, today)} · ${longDate(day)}`}
                  </span>
                  <span className="text-[13px] text-ink-3">{entries.length ? plural(entries.length, 'registro', 'registros') : '—'}</span>
                </button>
                {entries.length > 0 && (
                  <div>
                    {entries.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function DayDetail({ date, today, onNavigate }: { date: string; today: string; onNavigate: (day: string) => void }) {
  const day = useDayEntries(date);
  const { openNew } = useEntryEditor();
  const [mode, setMode] = useState<'resumen' | 'detalle'>('resumen');
  const swipe = useSwipe(() => onNavigate(addDays(date, -1)), () => date < today && onNavigate(addDays(date, 1)));
  const entries = day.data ?? [];
  const weekday = toDate(date).toLocaleDateString('es-ES', { weekday: 'long' });

  return (
    <section aria-label={`Registros del ${longDate(date)}`} className="lg:sticky lg:top-10" {...swipe}>
      <div className="mb-3 flex items-center gap-2">
        <IconButton label="Día anterior" onClick={() => onNavigate(addDays(date, -1))} className="bg-surface shadow-soft-sm">
          <ChevronLeft size={20} />
        </IconButton>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-xs font-bold tracking-[0.08em] text-brand uppercase">
            {date === today ? 'Hoy' : date === addDays(today, -1) ? 'Ayer' : weekday}
          </p>
          <h2 className="truncate font-display text-xl font-semibold uppercase">{longDate(date).split(', ')[1] ?? longDate(date)}</h2>
        </div>
        <IconButton label="Día siguiente" onClick={() => onNavigate(addDays(date, 1))} className="bg-surface shadow-soft-sm">
          <ChevronRight size={20} />
        </IconButton>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <Segmented
          label="Cómo mostrar el día"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'resumen', label: 'Resumen' },
            { value: 'detalle', label: 'Detalle' },
          ]}
        />
        {date <= today && (
          <Button variant="soft" size="sm" icon={<CalendarPlus size={16} />} onClick={() => openNew({ date })}>
            Añadir
          </Button>
        )}
      </div>

      {day.isPending ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <div className="card">
          <EmptyState title={date > today ? 'Este día aún no ha llegado' : 'Sin registros este día'}>
            {date > today ? 'Aquí verás lo que registres cuando llegue.' : 'Si comiste algo y no lo apuntaste, puedes añadirlo ahora.'}
          </EmptyState>
        </div>
      ) : mode === 'resumen' ? (
        <div className="card p-2">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <EntryTimeline entries={entries} />
      )}
    </section>
  );
}
