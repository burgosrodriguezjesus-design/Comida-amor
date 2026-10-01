import { Download, FileText, Printer, Share2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays } from '@shared/dates';
import type { Entry } from '@shared/types';
import { errorMessage } from '@/api/client';
import { useMe, useRangeEntries } from '@/api/hooks';
import { SettingsLink } from '@/components/Layout';
import { Button, Chip, EmptyState, PageHeader, Spinner, Switch } from '@/components/ui';
import { useFeedback } from '@/context/Feedback';
import { MEAL_TYPE_LABELS } from '@shared/constants';
import { longDate, numericDate, plural } from '@/lib/format';
import { feelingText, generateReportPdf, groupByDay, itemText, reportFileName, reportSummary, type ReportOptions } from '@/lib/pdf';
import { IS_LOCAL } from '@/lib/env';
import { saveFile } from '@/lib/files';
import { useNow } from '@/lib/useNow';

type Period = '7' | '14' | '30' | 'custom';

export function ReportPage() {
  const { date: today } = useNow();
  const me = useMe();
  const { toast } = useFeedback();
  const [period, setPeriod] = useState<Period>('7');
  const [customFrom, setCustomFrom] = useState(addDays(today, -13));
  const [customTo, setCustomTo] = useState(today);
  const [name, setName] = useState(me.data?.name ?? '');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeFeelings, setIncludeFeelings] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(false);
  const [includeEmptyDays, setIncludeEmptyDays] = useState(true);
  const [busy, setBusy] = useState<'pdf' | 'share' | null>(null);

  const from = period === 'custom' ? (customFrom <= customTo ? customFrom : customTo) : addDays(today, -(Number(period) - 1));
  const to = period === 'custom' ? (customFrom <= customTo ? customTo : customFrom) : today;
  const range = useRangeEntries(from, to);
  const entries = useMemo(() => range.data ?? [], [range.data]);
  const summary = reportSummary(entries, from, to);
  const options: ReportOptions = { name: name.trim() || me.data?.name || '', from, to, includeNotes, includeFeelings, includePhotos, includeEmptyDays };

  const buildPdf = async () => {
    const blob = await generateReportPdf(entries, options);
    return new File([blob], reportFileName(from, to), { type: 'application/pdf' });
  };

  const download = async () => {
    setBusy('pdf');
    try {
      const file = await buildPdf();
      const result = await saveFile(file, file.name);
      if (result.ok) toast({ message: 'PDF listo en tu dispositivo', tone: 'success' });
      else if (result.message) toast({ message: result.message, tone: 'error' });
    } catch (err) {
      toast({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy('share');
    try {
      const file = await buildPdf();
      const data = { files: [file], title: 'Diario de alimentación', text: `Diario de alimentación del ${numericDate(from)} al ${numericDate(to)}` };
      if (navigator.canShare?.(data)) {
        await navigator.share(data);
      } else {
        await saveFile(file, file.name);
        toast({ message: 'Tu navegador no permite compartir archivos directamente. Se ha descargado el PDF para que puedas enviarlo.', duration: 6000 });
      }
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') toast({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print">
        <PageHeader title="Informe" subtitle="Un resumen claro para enseñárselo a tu médico." actions={<SettingsLink />} />

        <section className="card mb-4 space-y-5 p-5">
          <div>
            <h2 className="label">Periodo</h2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['7', 'Últimos 7 días'],
                  ['14', 'Últimos 14 días'],
                  ['30', 'Últimos 30 días'],
                  ['custom', 'Elegir fechas'],
                ] as [Period, string][]
              ).map(([value, label]) => (
                <Chip key={value} selected={period === value} onClick={() => setPeriod(value)}>
                  {label}
                </Chip>
              ))}
            </div>
            {period === 'custom' && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-1 block text-[13px] text-ink-2">Desde</span>
                  <input type="date" className="field py-2.5" value={customFrom} max={today} onChange={(e) => e.target.value && setCustomFrom(e.target.value)} />
                </label>
                <label>
                  <span className="mb-1 block text-[13px] text-ink-2">Hasta</span>
                  <input type="date" className="field py-2.5" value={customTo} max={today} onChange={(e) => e.target.value && setCustomTo(e.target.value)} />
                </label>
              </div>
            )}
          </div>

        </section>

        <div className="mb-3 text-[15px] text-ink-2" aria-live="polite">
          {range.isPending
            ? 'Preparando el informe…'
            : `Del ${numericDate(from)} al ${numericDate(to)} · ${plural(summary.daysWithEntries, 'día con registros', 'días con registros')} · ${plural(summary.entries, 'registro', 'registros')}`}
        </div>
        <div className={`mb-4 grid gap-2 sm:gap-3 ${IS_LOCAL ? 'grid-cols-1' : 'grid-cols-3'}`}>
          <Button size="lg" className="flex-col gap-1 py-3 h-auto sm:flex-row" icon={<Download size={20} />} onClick={download} loading={busy === 'pdf'} disabled={busy !== null || range.isPending || entries.length === 0}>
            <span className="text-[13px] sm:text-[15px]">{IS_LOCAL ? 'Descargar PDF' : 'PDF'}</span>
          </Button>
          {!IS_LOCAL && (
            <>
          <Button size="lg" variant="secondary" className="h-auto flex-col gap-1 py-3 sm:flex-row" icon={<Printer size={20} />} onClick={() => window.print()} disabled={range.isPending || entries.length === 0}>
            <span className="text-[13px] sm:text-[15px]">Imprimir</span>
          </Button>
          <Button size="lg" variant="secondary" className="h-auto flex-col gap-1 py-3 sm:flex-row" icon={<Share2 size={20} />} onClick={share} loading={busy === 'share'} disabled={busy !== null || range.isPending || entries.length === 0}>
            <span className="text-[13px] sm:text-[15px]">Compartir</span>
          </Button>
            </>
          )}
        </div>

        <details className="card group mb-6 p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
            Opciones del informe
            <span className="text-sm font-normal text-ink-3 group-open:hidden">Nombre, notas, síntomas, fotos…</span>
          </summary>
          <div className="mt-4 space-y-5">
          <div>
            <label className="label" htmlFor="report-name">
              Nombre que aparecerá en el informe
            </label>
            <input id="report-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={me.data?.name} maxLength={80} />
          </div>

          <div className="space-y-2.5">
            <Switch checked={includeNotes} onChange={setIncludeNotes} label="Incluir notas" />
            <Switch checked={includeFeelings} onChange={setIncludeFeelings} label="Incluir síntomas y cómo me encontraba" />
            <Switch checked={includeEmptyDays} onChange={setIncludeEmptyDays} label="Mostrar también los días sin registros" />
            <Switch checked={includePhotos} onChange={setIncludePhotos} label="Añadir las fotos al PDF" description="Aparecen al final, en una página aparte." />
          </div>
          </div>
        </details>
      </div>

      {range.isPending ? (
        <Spinner />
      ) : range.isError ? (
        <EmptyState title="No se pudo preparar el informe">{errorMessage(range.error)}</EmptyState>
      ) : entries.length === 0 ? (
        <div className="card">
          <EmptyState icon={<FileText size={26} />} title="No hay registros en este periodo">
            Elige otro periodo o empieza a registrar lo que comes.
          </EmptyState>
        </div>
      ) : (
        <ReportPreview entries={entries} options={options} summary={summary} />
      )}
    </div>
  );
}

function ReportPreview({
  entries,
  options,
  summary,
}: {
  entries: Entry[];
  options: ReportOptions;
  summary: ReturnType<typeof reportSummary>;
}) {
  const days = groupByDay(entries, options.from, options.to, options.includeEmptyDays);
  return (
    <article className="print-area card p-5 sm:p-8" aria-label="Vista previa del informe">
      <header className="border-b border-line pb-5">
        <p className="no-print mb-3 text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Vista previa</p>
        <h2 className="text-2xl font-bold tracking-tight">Diario de alimentación</h2>
        <p className="text-sm text-ink-2">Registro personal para la consulta médica</p>
        <dl className="mt-4 grid gap-1 text-sm sm:grid-cols-[6rem_1fr]">
          <dt className="font-semibold text-ink-3">Nombre</dt>
          <dd>{options.name || '—'}</dd>
          <dt className="font-semibold text-ink-3">Periodo</dt>
          <dd>
            {numericDate(options.from)} – {numericDate(options.to)} ({summary.daysInRange} días)
          </dd>
          <dt className="font-semibold text-ink-3">Resumen</dt>
          <dd>
            {plural(summary.daysWithEntries, 'día con registros', 'días con registros')} · {plural(summary.entries, 'registro', 'registros')} ·{' '}
            {plural(summary.drinks, 'bebida', 'bebidas')}
            {options.includeFeelings && ` · ${summary.withSymptoms} con síntomas anotados`}
          </dd>
        </dl>
      </header>

      <div className="divide-y divide-line">
        {days.map((day) => (
          <section key={day.date} className="py-5">
            <h3 className="mb-3 text-[15px] font-bold tracking-wide uppercase">{longDate(day.date)}</h3>
            {day.entries.length === 0 ? (
              <p className="text-sm text-ink-3 italic">Sin registros</p>
            ) : (
              <ol className="space-y-4">
                {day.entries.map((entry) => {
                  const foods = entry.items.filter((i) => i.kind === 'food');
                  const drinks = entry.items.filter((i) => i.kind === 'drink');
                  const feeling = feelingText(entry);
                  return (
                    <li key={entry.id} className="print-avoid-break">
                      <p className="font-semibold">
                        <span className="tabular-nums">{entry.eatenAt.slice(11, 16)}</span> — {MEAL_TYPE_LABELS[entry.mealType].toUpperCase()}
                      </p>
                      <ul className="mt-1 space-y-0.5 pl-4 text-[15px]">
                        {foods.map((item, i) => (
                          <li key={i}>{itemText(item)}</li>
                        ))}
                        {drinks.length > 0 && (
                          <li className="text-ink-2">
                            <span className="font-semibold text-ink">Bebidas:</span> {drinks.map(itemText).join(', ')}
                          </li>
                        )}
                        {options.includeNotes && entry.notes && (
                          <li className="text-ink-2">
                            <span className="font-semibold text-ink">Notas:</span> {entry.notes}
                          </li>
                        )}
                        {options.includeFeelings && feeling && (
                          <li className="text-ink-2">
                            <span className="font-semibold text-ink">Cómo se encontraba:</span> {feeling}
                          </li>
                        )}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        ))}
      </div>
      <footer className="border-t border-line pt-4 text-xs text-ink-3">
        Registro personal elaborado con Comida Amor. No contiene diagnósticos ni valoraciones médicas.
      </footer>
    </article>
  );
}
