import clsx from 'clsx';
import { Droplet, Ellipsis, HeartPulse, Pencil, Repeat, StickyNote, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { SYMPTOM_LABELS } from '@shared/constants';
import type { Entry } from '@shared/types';
import { errorMessage } from '@/api/client';
import { useDeleteEntry } from '@/api/hooks';
import { useEntryEditor } from '@/context/EntryEditor';
import { useFeedback } from '@/context/Feedback';
import { MealBadge, mealLabel } from '@/lib/meal';
import { Lightbox } from './Lightbox';
import { Menu } from './Menu';

export function SymptomTags({ entry }: { entry: Entry }) {
  if (entry.symptoms.length === 0 && !entry.feelingNote) return null;
  const none = entry.symptoms.length === 1 && entry.symptoms[0] === 'sin_sintomas';
  return (
    <div className="mt-3 rounded-2xl bg-surface-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <HeartPulse size={15} className="text-ink-3" aria-label="Cómo se encontraba" />
        {entry.symptoms.map((s) => (
          <span
            key={s}
            className={clsx(
              'rounded-full px-2.5 py-0.5 text-[13px] font-medium',
              none ? 'bg-ok-soft text-ok' : 'bg-surface text-ink',
            )}
          >
            {s === 'otros' && entry.otherSymptoms ? entry.otherSymptoms : SYMPTOM_LABELS[s]}
          </span>
        ))}
      </div>
      {entry.feelingNote && <p className="mt-1.5 text-sm leading-snug text-ink-2">{entry.feelingNote}</p>}
    </div>
  );
}

/** Tarjeta completa de un registro: todo lo que se apuntó. */
export function EntryCard({ entry, showTime = true }: { entry: Entry; showTime?: boolean }) {
  const { openEdit, repeat } = useEntryEditor();
  const { confirm, toast } = useFeedback();
  const remove = useDeleteEntry();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const foods = entry.items.filter((i) => i.kind === 'food');
  const drinks = entry.items.filter((i) => i.kind === 'drink');
  const time = entry.eatenAt.slice(11, 16);

  const handleDelete = async () => {
    const ok = await confirm({
      title: '¿Eliminar este registro?',
      message: `${mealLabel(entry.mealType)} de las ${time}. Se borrará definitivamente, junto con sus fotos.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    remove.mutate(
      { id: entry.id, date: entry.eatenAt.slice(0, 10) },
      {
        onSuccess: () => toast({ message: 'Registro eliminado' }),
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  };

  return (
    <article
      className={clsx('card animate-pop-in relative p-4 transition-opacity', remove.isPending && 'opacity-50')}
      aria-label={`${mealLabel(entry.mealType)} a las ${time}`}
    >
      <div className="flex items-start gap-3">
        <MealBadge type={entry.mealType} />
        <button type="button" onClick={() => openEdit(entry)} className="min-w-0 flex-1 text-left" aria-label={`Editar ${mealLabel(entry.mealType)} de las ${time}`}>
          <h3 className="leading-tight font-semibold text-ink">{mealLabel(entry.mealType)}</h3>
          {showTime && <p className="text-sm text-ink-3 tabular-nums">{time}</p>}
        </button>
        <Menu
          label="Opciones del registro"
          trigger={<Ellipsis size={20} />}
          items={[
            { label: 'Editar', icon: <Pencil size={17} />, onSelect: () => openEdit(entry) },
            { label: 'Repetir ahora', icon: <Repeat size={17} />, onSelect: () => repeat(entry) },
            { label: 'Eliminar', icon: <Trash2 size={17} />, onSelect: handleDelete, danger: true },
          ]}
        />
      </div>

      <button type="button" onClick={() => openEdit(entry)} className="mt-3 block w-full text-left" tabIndex={-1}>
        {foods.length > 0 && (
          <ul className="space-y-1">
            {foods.map((item, i) => (
              <li key={item.id ?? i} className="flex items-baseline gap-2 text-[15px] leading-snug text-ink">
                <span className="mt-[0.45em] h-1.5 w-1.5 shrink-0 self-start rounded-full bg-brand/60" aria-hidden="true" />
                <span>
                  {item.name}
                  {item.quantity && <span className="text-ink-3"> · {item.quantity}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {drinks.length > 0 && (
          <ul className={clsx('space-y-1', foods.length > 0 && 'mt-2 border-t border-dashed border-line pt-2')}>
            {drinks.map((item, i) => (
              <li key={item.id ?? i} className="flex items-baseline gap-2 text-[15px] leading-snug text-ink">
                <Droplet size={13} className="shrink-0 self-start translate-y-[3px] text-drink" aria-label="Bebida" />
                <span>
                  {item.name}
                  {item.quantity && <span className="text-ink-3"> · {item.quantity}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {entry.notes && (
          <p className="mt-3 flex gap-2 text-sm leading-snug text-ink-2">
            <StickyNote size={15} className="mt-0.5 shrink-0 text-ink-3" aria-label="Notas" />
            {entry.notes}
          </p>
        )}
      </button>

      {entry.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {entry.photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setLightbox(index)}
              className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-surface-2 sm:h-24 sm:w-24"
              aria-label="Ver foto en grande"
            >
              <img src={photo.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform hover:scale-105" />
            </button>
          ))}
        </div>
      )}

      <SymptomTags entry={entry} />
      {lightbox !== null && <Lightbox photos={entry.photos} index={lightbox} onClose={() => setLightbox(null)} />}
    </article>
  );
}

/** Lista cronológica tipo diario: hora a la izquierda y tarjeta a la derecha. */
export function EntryTimeline({ entries }: { entries: Entry[] }) {
  return (
    <ol className="relative space-y-4">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative grid grid-cols-[3.25rem_1fr] gap-3">
          <div className="relative flex flex-col items-center pt-4">
            <span className="text-[15px] font-bold text-ink tabular-nums">{entry.eatenAt.slice(11, 16)}</span>
            <span className="mt-2 h-2.5 w-2.5 rounded-full ring-4 ring-bg" style={{ background: `var(--meal-${entry.mealType})` }} aria-hidden="true" />
            {index < entries.length - 1 && <span className="absolute top-14 -bottom-6 w-px bg-line-strong" aria-hidden="true" />}
          </div>
          <EntryCard entry={entry} showTime={false} />
        </li>
      ))}
    </ol>
  );
}

/** Fila compacta: "08:12 — Café con leche + tostada". */
export function EntryRow({ entry, highlight, onClick }: { entry: Entry; highlight?: string; onClick?: () => void }) {
  const { openEdit } = useEntryEditor();
  const summary = entry.items.map((i) => i.name).join(' + ') || entry.notes;
  const hasSymptoms = entry.symptoms.some((s) => s !== 'sin_sintomas');
  return (
    <button
      type="button"
      onClick={onClick ?? (() => openEdit(entry))}
      className="flex w-full items-start gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
    >
      <span className="w-12 shrink-0 pt-0.5 text-[15px] font-bold text-ink tabular-nums">{entry.eatenAt.slice(11, 16)}</span>
      <MealBadge type={entry.mealType} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug text-ink">
          <Highlight text={summary} term={highlight} />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[13px] text-ink-3">
          <span>{mealLabel(entry.mealType)}</span>
          {entry.photos.length > 0 && <span>· {entry.photos.length === 1 ? '1 foto' : `${entry.photos.length} fotos`}</span>}
          {hasSymptoms && <span>· síntomas anotados</span>}
          {entry.notes && <span>· con notas</span>}
        </span>
      </span>
    </button>
  );
}

function stripAccents(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Resalta las palabras buscadas sin tener en cuenta tildes ni mayúsculas. */
export function Highlight({ text, term }: { text: string; term?: string }) {
  const words = (term ?? '').trim().split(/\s+/).filter((w) => w.length > 1).map(stripAccents);
  if (words.length === 0) return <>{text}</>;
  const plain = stripAccents(text);
  const marks: [number, number][] = [];
  for (const word of words) {
    let from = 0;
    for (;;) {
      const index = plain.indexOf(word, from);
      if (index === -1) break;
      marks.push([index, index + word.length]);
      from = index + word.length;
    }
  }
  if (marks.length === 0) return <>{text}</>;
  marks.sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  marks.forEach(([start, end], i) => {
    if (start < cursor) return;
    parts.push(text.slice(cursor, start));
    parts.push(<mark key={i}>{text.slice(start, end)}</mark>);
    cursor = end;
  });
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
