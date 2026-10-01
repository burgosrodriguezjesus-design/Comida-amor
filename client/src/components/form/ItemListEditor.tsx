import { Droplet, Plus, UtensilsCrossed, X } from 'lucide-react';
import { useState } from 'react';
import type { ItemKind } from '@shared/constants';
import type { FoodOption, SuggestionItem } from '@shared/types';
import { normalizeText } from '@shared/text';
import { emptyItem, type DraftItem } from '@/lib/draft';
import { FoodNameInput } from './FoodNameInput';

/** Lista editable de alimentos o de bebidas, cada uno con su cantidad aproximada. */
export function ItemListEditor({
  kind,
  items,
  onChange,
  foods,
  quickPicks = [],
}: {
  kind: ItemKind;
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  foods: FoodOption[];
  quickPicks?: SuggestionItem[];
}) {
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const isDrink = kind === 'drink';
  const Icon = isDrink ? Droplet : UtensilsCrossed;

  const update = (key: string, patch: Partial<DraftItem>) =>
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const remove = (key: string) => onChange(items.filter((item) => item.key !== key));
  const add = (item: DraftItem = emptyItem()) => {
    // Si la última fila está vacía, se reutiliza.
    const last = items[items.length - 1];
    if (last && !last.name.trim() && item.name) {
      onChange([...items.slice(0, -1), { ...last, name: item.name, quantity: item.quantity }]);
      return;
    }
    setLastAdded(item.key);
    onChange([...items, item]);
  };

  const present = new Set(items.map((i) => normalizeText(i.name)));
  const picks = quickPicks.filter((p) => !present.has(p.nameNorm)).slice(0, 6);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-xl ${isDrink ? 'bg-drink-soft text-drink' : 'bg-brand-soft text-brand'}`}
          aria-hidden="true"
        >
          <Icon size={15} />
        </span>
        <h3 className="font-semibold text-ink">{isDrink ? 'Bebidas' : 'Alimentos'}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={item.key} className="flex items-center gap-2">
            <FoodNameInput
              value={item.name}
              onChange={(name) => update(item.key, { name })}
              foods={foods}
              kind={kind}
              autoFocus={item.key === lastAdded}
              ariaLabel={isDrink ? `Bebida ${index + 1}` : `Alimento ${index + 1}`}
              placeholder={isDrink ? 'Ej.: Agua, café con leche…' : index === 0 ? 'Ej.: Tostadas con aceite' : 'Otro alimento'}
            />
            <input
              className="field min-w-0 flex-1 py-2.5"
              value={item.quantity}
              onChange={(e) => update(item.key, { quantity: e.target.value })}
              placeholder={isDrink ? '1 vaso' : 'Cantidad'}
              aria-label={`Cantidad de ${item.name || (isDrink ? 'la bebida' : 'el alimento')}`}
              autoComplete="off"
              enterKeyHint="done"
            />
            <button
              type="button"
              onClick={() => remove(item.key)}
              aria-label={`Quitar ${item.name || 'fila'}`}
              className="flex h-10 w-9 shrink-0 items-center justify-center rounded-xl text-ink-3 hover:bg-surface-2 hover:text-danger"
            >
              <X size={18} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => add()}
          className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand hover:bg-brand-soft"
        >
          <Plus size={17} /> {isDrink ? 'Añadir bebida' : 'Añadir alimento'}
        </button>
        {picks.map((pick) => (
          <button
            key={pick.nameNorm}
            type="button"
            onClick={() => add({ ...emptyItem(), name: pick.name, quantity: pick.quantity })}
            className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-surface px-3 text-sm text-ink-2 hover:border-line-strong hover:text-ink"
          >
            <Plus size={14} aria-hidden="true" /> {pick.name}
          </button>
        ))}
      </div>
    </div>
  );
}
