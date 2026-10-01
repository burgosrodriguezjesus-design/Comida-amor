import clsx from 'clsx';
import { Droplet, History, ListPlus, UtensilsCrossed } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { ItemKind, MealType } from '@shared/constants';
import type { Entry, EntryInput, SuggestionMeal } from '@shared/types';
import { localDateTimeParts } from '@shared/dates';
import { detectItemKind, normalizeText, splitFoods } from '@shared/text';
import { errorMessage } from '@/api/client';
import { useCreateEntry, useSuggestions } from '@/api/hooks';
import { useFeedback } from '@/context/Feedback';
import { autoMealType, emptyDraft, itemsToDraftLists, type Draft } from '@/lib/draft';
import { mealLabel } from '@/lib/meal';
import { MealTypePicker } from './form/MealTypePicker';
import { WhenFields } from './form/WhenFields';
import { Sheet } from './Sheet';
import { Button } from './ui';

/**
 * Registro rápido: escribir (o tocar algo reciente), comprobar la hora y guardar.
 * Pensado para tardar menos de 10 segundos.
 */
export function QuickAddSheet({
  onClose,
  onSaved,
  onMoreDetails,
}: {
  onClose: () => void;
  onSaved: (entry: Entry) => void;
  onMoreDetails: (draft: Draft) => void;
}) {
  const [text, setText] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [kinds, setKinds] = useState<Record<string, ItemKind>>({});
  const [mealType, setMealType] = useState<MealType | null>(null);
  const [when, setWhen] = useState(() => ({ ...localDateTimeParts(new Date()), touched: false }));
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const create = useCreateEntry();
  const { confirm } = useFeedback();
  const suggestions = useSuggestions(when.time);

  const knownKinds = useMemo(() => {
    const map = new Map<string, ItemKind>();
    for (const item of suggestions.data?.items ?? []) map.set(item.nameNorm, item.kind);
    return map;
  }, [suggestions.data]);

  const items = useMemo(
    () =>
      splitFoods(text).map((name) => {
        const norm = normalizeText(name);
        return { name, quantity: quantities[norm] ?? '', kind: kinds[norm] ?? knownKinds.get(norm) ?? detectItemKind(name) };
      }),
    [text, quantities, kinds, knownKinds],
  );
  const selected = new Set(items.map((i) => normalizeText(i.name)));
  const effectiveType = mealType ?? autoMealType(when.touched ? when.time : localDateTimeParts(new Date()).time, items);

  const toggleSuggestion = (name: string, quantity: string, kind: ItemKind) => {
    const norm = normalizeText(name);
    setError(null);
    if (selected.has(norm)) {
      setText(items.filter((i) => normalizeText(i.name) !== norm).map((i) => i.name).join(', '));
      return;
    }
    setQuantities((q) => ({ ...q, [norm]: q[norm] ?? quantity }));
    setKinds((k) => ({ ...k, [norm]: k[norm] ?? kind }));
    setText((current) => {
      const base = current.trim().replace(/[,;+\s]+$/, '');
      return base ? `${base}, ${name}` : name;
    });
  };

  const pickMeal = (meal: SuggestionMeal) => {
    setText(meal.items.map((i) => i.name).join(', '));
    setQuantities(Object.fromEntries(meal.items.map((i) => [normalizeText(i.name), i.quantity])));
    setKinds(Object.fromEntries(meal.items.map((i) => [normalizeText(i.name), i.kind])));
    setMealType(meal.mealType);
    setError(null);
  };

  const toggleKind = (name: string, kind: ItemKind) => {
    setKinds((k) => ({ ...k, [normalizeText(name)]: kind === 'drink' ? 'food' : 'drink' }));
  };

  const save = async () => {
    if (items.length === 0) {
      setError('Escribe qué has comido o toca una comida reciente.');
      textRef.current?.focus();
      return;
    }
    const moment = when.touched ? when : localDateTimeParts(new Date());
    const input: EntryInput = {
      eatenAt: `${moment.date}T${moment.time}`,
      mealType: mealType ?? autoMealType(moment.time, items),
      items,
    };
    try {
      const entry = await create.mutateAsync(input);
      onSaved(entry);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const moreDetails = () => {
    const lists = itemsToDraftLists(items);
    onMoreDetails(
      emptyDraft({
        date: when.date,
        time: when.time,
        timeTouched: when.touched,
        mealType,
        foods: lists.foods.length || lists.drinks.length ? lists.foods : [{ key: 'k0', name: '', quantity: '' }],
        drinks: lists.drinks,
      }),
    );
  };

  const recentItems = suggestions.data?.items ?? [];
  const recentMeals = suggestions.data?.meals ?? [];

  return (
    <Sheet
      open
      onClose={async () => {
        if (items.length === 0) return onClose();
        const discard = await confirm({
          title: '¿Descartar lo que has escrito?',
          confirmLabel: 'Descartar',
          cancelLabel: 'Seguir',
          danger: true,
        });
        if (discard) onClose();
      }}
      title="Registro rápido"
      initialFocus={textRef}
      footer={
        <div className="space-y-2">
          <Button size="xl" className="w-full" onClick={save} loading={create.isPending}>
            Guardar
          </Button>
          <button
            type="button"
            onClick={moreDetails}
            className="flex w-full items-center justify-center gap-1.5 py-1.5 text-sm font-semibold text-ink-2 hover:text-ink"
          >
            <ListPlus size={17} aria-hidden="true" /> Más detalles: cantidades, foto, notas…
          </button>
        </div>
      }
    >
      <div className="space-y-5 pt-1 pb-2">
        <div>
          <label htmlFor="quick-text" className="mb-2 block font-display text-lg font-medium text-ink">
            ¿Qué acabas de comer?
          </label>
          <textarea
            id="quick-text"
            ref={textRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void save();
              }
            }}
            rows={2}
            enterKeyHint="done"
            autoCapitalize="sentences"
            placeholder="Ej.: Café con leche y un croissant"
            className="field resize-none text-[17px] leading-snug"
          />
          {items.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Se guardará como">
              {items.map((item) => (
                <li key={`${item.name}-${item.kind}`}>
                  <button
                    type="button"
                    onClick={() => toggleKind(item.name, item.kind)}
                    title={item.kind === 'drink' ? 'Bebida (toca para marcar como alimento)' : 'Alimento (toca para marcar como bebida)'}
                    className={clsx(
                      'animate-pop-in inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium',
                      item.kind === 'drink' ? 'bg-drink-soft text-drink' : 'bg-surface-2 text-ink',
                    )}
                  >
                    {item.kind === 'drink' ? <Droplet size={14} aria-label="Bebida" /> : <UtensilsCrossed size={14} aria-label="Alimento" />}
                    {item.name}
                    {item.quantity && <span className="opacity-70">· {item.quantity}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>

        <div>
          <span className="label">Hora</span>
          <WhenFields
            date={when.date}
            time={when.time}
            touched={when.touched}
            onChange={({ date, time, touched }) => setWhen({ date, time, touched })}
          />
        </div>

        {recentItems.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-2">
              <History size={15} aria-hidden="true" /> Comidas recientes
            </h3>
            <div className="flex flex-wrap gap-2">
              {recentItems.slice(0, 10).map((item) => {
                const isSelected = selected.has(item.nameNorm);
                return (
                  <button
                    key={item.nameNorm}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleSuggestion(item.name, item.quantity, item.kind)}
                    className={clsx(
                      'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[15px] font-medium transition-all active:scale-[0.97]',
                      isSelected ? 'border-transparent bg-ink text-bg' : 'border-line-strong bg-surface text-ink hover:border-ink-3',
                    )}
                  >
                    {item.kind === 'drink' && <Droplet size={14} className={isSelected ? '' : 'text-drink'} aria-hidden="true" />}
                    {item.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {recentMeals.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-2">Repetir una comida</h3>
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6">
              {recentMeals.slice(0, 5).map((meal) => (
                <button
                  key={meal.lastAt + meal.items.map((i) => i.name).join()}
                  type="button"
                  onClick={() => pickMeal(meal)}
                  className="w-56 shrink-0 rounded-2xl border border-line bg-surface p-3 text-left transition-colors hover:border-line-strong"
                >
                  <span className="block text-xs font-semibold text-ink-3">{mealLabel(meal.mealType)}</span>
                  <span className="mt-0.5 line-clamp-2 block text-sm font-medium text-ink">
                    {meal.items.map((i) => i.name).join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <span className="label">
            Tipo <span className="font-normal text-ink-3">· {mealType ? 'elegido por ti' : 'sugerido por la hora'}</span>
          </span>
          <MealTypePicker compact value={effectiveType} isAuto={mealType === null} onChange={setMealType} />
        </div>
      </div>
    </Sheet>
  );
}
