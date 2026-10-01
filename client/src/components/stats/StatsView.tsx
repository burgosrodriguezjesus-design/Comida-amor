import { Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SYMPTOM_LABELS } from '@shared/constants';
import { addDays, timeToMinutes } from '@shared/dates';
import type { StatsResponse } from '@shared/types';
import { errorMessage } from '@/api/client';
import { useStats } from '@/api/hooks';
import { EmptyState, SectionTitle, Segmented, Spinner } from '@/components/ui';
import { MealBadge, mealLabel } from '@/lib/meal';
import { longDate, numericDate, shortDate, startOfWeek } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { BarList, ColumnChart, DataTable } from './charts';

type Period = '7' | '30' | '90' | 'todo';

const formatNumber = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });

export function StatsView() {
  const { date: today } = useNow();
  const [period, setPeriod] = useState<Period>('30');
  const from = period === 'todo' ? '' : addDays(today, -(Number(period) - 1));
  const stats = useStats(from, today);
  const data = stats.data;

  return (
    <div>
      <Segmented
        label="Periodo de las estadísticas"
        className="mb-4 w-full"
        value={period}
        onChange={setPeriod}
        options={[
          { value: '7', label: '7 días' },
          { value: '30', label: '30 días' },
          { value: '90', label: '90 días' },
          { value: 'todo', label: 'Todo' },
        ]}
      />
      <p className="mb-5 flex items-start gap-2 text-[13px] leading-snug text-ink-3">
        <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        Datos objetivos de tu registro. No son una valoración médica ni relacionan alimentos con síntomas.
      </p>
      {stats.isPending ? (
        <Spinner />
      ) : stats.isError || !data ? (
        <EmptyState title="No se pudieron calcular">{errorMessage(stats.error)}</EmptyState>
      ) : data.totalEntries === 0 ? (
        <div className="card">
          <EmptyState title="Sin datos en este periodo">Cuando registres comidas verás aquí un resumen.</EmptyState>
        </div>
      ) : (
        <StatsContent data={data} />
      )}
    </div>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[13px] font-semibold text-ink-2">{label}</p>
      <p className="mt-1 text-[1.75rem] leading-none font-semibold tracking-tight text-ink">{value}</p>
      {detail && <p className="mt-1.5 text-[13px] text-ink-3">{detail}</p>}
    </div>
  );
}

function StatsContent({ data }: { data: StatsResponse }) {
  // Más de 4 meses: se agrupa por semanas para que las columnas no se aplasten.
  const perPeriod = useMemo(() => {
    if (data.perDay.length <= 120) {
      return {
        weekly: false,
        rows: data.perDay.map((d) => ({ key: d.date, label: shortDate(d.date).split(' ')[0], title: longDate(d.date), value: d.count })),
      };
    }
    const weeks = new Map<string, number>();
    for (const d of data.perDay) {
      const w = startOfWeek(d.date);
      weeks.set(w, (weeks.get(w) ?? 0) + d.count);
    }
    return {
      weekly: true,
      rows: Array.from(weeks.entries()).map(([w, count]) => ({ key: w, label: shortDate(w), title: `Semana del ${shortDate(w)}`, value: count })),
    };
  }, [data.perDay]);

  const tickEvery = Math.max(1, Math.ceil(perPeriod.rows.length / 7));
  const hours = data.byHour.map((count, h) => ({
    key: String(h),
    label: `${h}h`,
    title: `De ${String(h).padStart(2, '0')}:00 a ${String(h).padStart(2, '0')}:59`,
    value: count,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Tile
          label="Días registrados"
          value={`${data.daysWithEntries} de ${data.daysInRange}`}
          detail={`${numericDate(data.from)} – ${numericDate(data.to)}`}
        />
        <Tile label="Registros" value={formatNumber(data.totalEntries)} detail="comidas y bebidas apuntadas" />
        <Tile label="Media por día" value={formatNumber(data.avgEntriesPerDay)} detail="en los días con registros" />
        <Tile label="Bebidas anotadas" value={formatNumber(data.totalDrinks)} />
      </div>

      <section className="card p-5">
        <SectionTitle>{perPeriod.weekly ? 'Registros por semana' : 'Número de registros por día'}</SectionTitle>
        <ColumnChart
          data={perPeriod.rows}
          tickEvery={tickEvery}
          unit={['registro', 'registros']}
          caption={perPeriod.weekly ? 'Registros por semana' : 'Número de registros por día'}
        />
      </section>

      <section className="card p-5">
        <SectionTitle>Horarios habituales</SectionTitle>
        <p className="-mt-1 mb-4 text-[13px] text-ink-3">
          El punto marca la hora más habitual (mediana); la franja, la mitad central de los registros; la línea fina, de la primera a la última hora registrada.
        </p>
        <MealTimes data={data} />
      </section>

      <section className="card p-5">
        <SectionTitle>A qué horas registras</SectionTitle>
        <ColumnChart data={hours} tickEvery={3} unit={['registro', 'registros']} caption="Registros según la hora del día" height={140} />
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="card p-5">
          <SectionTitle>Alimentos más frecuentes</SectionTitle>
          <BarList
            items={data.topFoods.map((f) => ({ key: f.name, label: f.name, value: f.count }))}
            empty="Sin alimentos en este periodo."
          />
        </section>
        <section className="card p-5">
          <SectionTitle>Bebidas más frecuentes</SectionTitle>
          <BarList
            items={data.topDrinks.map((f) => ({ key: f.name, label: f.name, value: f.count }))}
            color="var(--drink)"
            empty="Sin bebidas en este periodo."
          />
        </section>
      </div>

      <section className="card p-5">
        <SectionTitle>Síntomas anotados</SectionTitle>
        <p className="-mt-1 mb-4 text-[13px] text-ink-3">
          {data.entriesWithSymptoms === 0
            ? 'No has anotado síntomas en este periodo.'
            : `En ${data.entriesWithSymptoms} ${data.entriesWithSymptoms === 1 ? 'registro' : 'registros'} anotaste algún síntoma`}
          {data.entriesWithoutSymptoms > 0 && ` · en ${data.entriesWithoutSymptoms} marcaste «Sin síntomas»`}.
        </p>
        <BarList
          items={data.symptoms.map((s) => ({ key: s.code, label: SYMPTOM_LABELS[s.code], value: s.count }))}
          color="var(--ink-3)"
          empty=""
        />
      </section>
    </div>
  );
}

function MealTimes({ data }: { data: StatsResponse }) {
  // Eje ajustado a las horas con registros (p. ej. de 7h a 24h) para que las franjas se vean bien.
  const minMinutes = Math.min(...data.mealTimes.map((m) => timeToMinutes(m.earliest)));
  const maxMinutes = Math.max(...data.mealTimes.map((m) => timeToMinutes(m.latest)));
  const start = Math.max(0, Math.floor(minMinutes / 180) * 180);
  const end = Math.min(1440, Math.max(start + 360, Math.ceil((maxMinutes + 1) / 180) * 180));
  const pct = (time: string) => ((timeToMinutes(time) - start) / (end - start)) * 100;
  const ticks: number[] = [];
  for (let m = start; m <= end; m += 180) ticks.push(m / 60);
  return (
    <div>
      <ul className="space-y-3.5">
        {data.mealTimes.map((m) => (
          <li key={m.mealType} className="grid grid-cols-[minmax(0,8.5rem)_1fr] items-center gap-3 sm:grid-cols-[11rem_1fr]">
            <div className="flex min-w-0 items-center gap-2">
              <MealBadge type={m.mealType} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-[14px] leading-tight font-semibold">{mealLabel(m.mealType)}</p>
                <p className="text-[12.5px] text-ink-3 tabular-nums">
                  ~{m.median} · {m.count}×
                </p>
              </div>
            </div>
            <div
              className="relative h-6"
              title={`${mealLabel(m.mealType)}: normalmente entre ${m.p25} y ${m.p75} (de ${m.earliest} a ${m.latest})`}
            >
              {ticks.map((h) => (
                <div key={h} className="absolute top-0 bottom-0 w-px bg-line" style={{ left: `${(((h * 60) - start) / (end - start)) * 100}%` }} aria-hidden="true" />
              ))}
              <div
                className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-ink-3/50"
                style={{ left: `${pct(m.earliest)}%`, width: `${pct(m.latest) - pct(m.earliest)}%` }}
                aria-hidden="true"
              />
              <div
                className="absolute top-1/2 h-4 -translate-x-[2px] -translate-y-1/2 rounded-full"
                style={{
                  left: `${pct(m.p25)}%`,
                  width: `max(14px, calc(${pct(m.p75) - pct(m.p25)}% + 4px))`,
                  background: 'color-mix(in srgb, var(--brand) 35%, transparent)',
                }}
                aria-hidden="true"
              />
              <div
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-surface"
                style={{ left: `${pct(m.median)}%` }}
                aria-hidden="true"
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid grid-cols-[minmax(0,8.5rem)_1fr] gap-3 sm:grid-cols-[11rem_1fr]" aria-hidden="true">
        <span />
        <div className="relative h-4 text-[11px] text-ink-3">
          {ticks.map((h) => (
            <span key={h} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${(((h * 60) - start) / (end - start)) * 100}%` }}>
              {h}h
            </span>
          ))}
        </div>
      </div>
      <DataTable
        caption="Horarios habituales por tipo de comida"
        headers={['Tipo', 'Habitual', 'Franja central', 'Veces']}
        rows={data.mealTimes.map((m) => [mealLabel(m.mealType), m.median, `${m.p25}–${m.p75}`, String(m.count)])}
      />
    </div>
  );
}
