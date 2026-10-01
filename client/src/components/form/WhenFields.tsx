import clsx from 'clsx';
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
      {/* Rejilla con columnas que pueden encogerse: en iPhone los campos de fecha y hora
          tienen un ancho propio que, en una fila flexible, hacía que se montaran. */}
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <label className="block min-w-0">
          <span className="sr-only">Hora</span>
          <input
            type="time"
            className="field px-3.5 py-2.5 text-[17px] font-semibold tabular-nums"
            value={isNow ? now.time : time}
            onChange={(e) => e.target.value && onChange({ date: isNow ? now.date : date, time: e.target.value, touched: true })}
            required
          />
        </label>
        <label className="block min-w-0">
          <span className="sr-only">Día</span>
          <input
            type="date"
            className="field px-3.5 py-2.5"
            value={isNow ? now.date : date}
            max={now.date}
            onChange={(e) => e.target.value && onChange({ date: e.target.value, time: isNow ? now.time : time, touched: true })}
            required
          />
        </label>
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
