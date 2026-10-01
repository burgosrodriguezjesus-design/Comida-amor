import clsx from 'clsx';
import { Clock } from 'lucide-react';
import { localDateTimeParts } from '@shared/dates';
import { shiftDateTime } from '@/lib/draft';
import { relativeDayLabel } from '@/lib/format';

/**
 * Fecha y hora del registro. Por defecto "Ahora"; se puede ajustar a mano
 * o con atajos ("Hace 15 min") si se registra algo que se comió antes.
 */
export function WhenFields({
  date,
  time,
  touched,
  onChange,
  showShortcuts = true,
}: {
  date: string;
  time: string;
  touched: boolean;
  onChange: (value: { date: string; time: string; touched: boolean }) => void;
  showShortcuts?: boolean;
}) {
  const now = localDateTimeParts(new Date());
  const shortcuts = [
    { label: 'Hace 15 min', minutes: -15 },
    { label: 'Hace 30 min', minutes: -30 },
    { label: 'Hace 1 h', minutes: -60 },
    { label: 'Hace 2 h', minutes: -120 },
  ];
  const isNow = !touched;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label className="relative min-w-[8.75rem] flex-1">
            <span className="sr-only">Hora</span>
            <Clock size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <input
              type="time"
              className="field py-2.5 pl-10 text-[17px] font-semibold tabular-nums"
              value={isNow ? now.time : time}
              onChange={(e) => e.target.value && onChange({ date: isNow ? now.date : date, time: e.target.value, touched: true })}
              required
            />
          </label>
          <label className="min-w-[9rem] flex-[1.2]">
            <span className="sr-only">Día</span>
            <input
              type="date"
              className="field py-2.5"
              value={isNow ? now.date : date}
              max={now.date}
              onChange={(e) => e.target.value && onChange({ date: e.target.value, time: isNow ? now.time : time, touched: true })}
              required
            />
          </label>
        </div>
      </div>
      <p className="mt-1.5 text-[13px] text-ink-3">
        {isNow ? 'Se guardará con la hora actual.' : `${relativeDayLabel(date, now.date)} a las ${time}`}
      </p>
      {showShortcuts && (
        <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          <button
            type="button"
            onClick={() => onChange({ ...now, touched: false })}
            className={clsx(
              'h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors',
              isNow ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 hover:text-ink',
            )}
          >
            Ahora
          </button>
          {shortcuts.map((s) => (
            <button
              key={s.minutes}
              type="button"
              onClick={() => onChange({ ...shiftDateTime(now.date, now.time, s.minutes), touched: true })}
              className="h-9 shrink-0 rounded-full bg-surface-2 px-3.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
