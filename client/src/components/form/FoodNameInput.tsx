import { useMemo, useState } from 'react';
import type { FoodOption } from '@shared/types';
import type { ItemKind } from '@shared/constants';
import { normalizeText } from '@shared/text';

/** Campo de nombre con sugerencias de alimentos ya registrados. */
export function FoodNameInput({
  value,
  onChange,
  foods,
  kind,
  placeholder,
  autoFocus,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  foods: FoodOption[];
  kind: ItemKind;
  placeholder: string;
  autoFocus?: boolean;
  ariaLabel: string;
}) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = useMemo(() => {
    const q = normalizeText(value);
    if (!q) return [];
    const starts: FoodOption[] = [];
    const contains: FoodOption[] = [];
    for (const food of foods) {
      if (food.nameNorm === q) continue;
      if (food.nameNorm.startsWith(q)) starts.push(food);
      else if (food.nameNorm.includes(q)) contains.push(food);
    }
    const sortKind = (list: FoodOption[]) => list.sort((a, b) => Number(b.kind === kind) - Number(a.kind === kind) || b.count - a.count);
    return [...sortKind(starts), ...sortKind(contains)].slice(0, 5);
  }, [value, foods, kind]);

  const open = focused && matches.length > 0;

  return (
    <div className="relative min-w-0 flex-[1.6]">
      <input
        className="field py-2.5"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="sentences"
        enterKeyHint="next"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(matches.length - 1, i + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            onChange(matches[active].name);
            setFocused(false);
          }
        }}
      />
      {open && (
        <ul
          role="listbox"
          className="animate-pop-in absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-soft-lg"
        >
          {matches.map((food, index) => (
            <li key={food.nameNorm} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[15px] hover:bg-surface-2 ${index === active ? 'bg-surface-2' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(food.name);
                  setFocused(false);
                }}
              >
                <span className="truncate">{food.name}</span>
                <span className="shrink-0 text-xs text-ink-3">{food.count}×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
