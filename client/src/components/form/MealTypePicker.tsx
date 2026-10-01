import clsx from 'clsx';
import { MEAL_TYPES, type MealType } from '@shared/constants';
import { MEAL_ICONS, mealColor } from '@/lib/meal';

/** Selector del tipo de comida. `compact` lo muestra como una fila deslizable (registro rápido). */
export function MealTypePicker({
  value,
  isAuto,
  onChange,
  compact,
}: {
  value: MealType;
  isAuto?: boolean;
  onChange: (value: MealType) => void;
  compact?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Tipo de comida"
      className={clsx(compact ? 'no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6' : 'grid grid-cols-4 gap-2')}
    >
      {MEAL_TYPES.map((type) => {
        const Icon = MEAL_ICONS[type.id];
        const selected = value === type.id;
        return (
          <button
            key={type.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(type.id)}
            className={clsx(
              'flex shrink-0 items-center rounded-2xl border text-ink transition-all duration-150 active:scale-[0.97]',
              compact ? 'h-10 gap-1.5 px-3 text-sm font-medium' : 'flex-col justify-center gap-1 px-1 py-2.5 text-[12.5px] font-semibold',
              selected ? 'border-transparent shadow-soft-sm' : 'border-line bg-surface hover:border-line-strong',
            )}
            style={selected ? { ...mealColor(type.id), boxShadow: `inset 0 0 0 2px var(--meal-${type.id})` } : undefined}
          >
            <Icon size={compact ? 16 : 20} style={{ color: `var(--meal-${type.id})` }} aria-hidden="true" />
            <span className={clsx(selected && 'text-ink')}>{type.label}</span>
            {selected && isAuto && compact && <span className="text-[11px] font-normal text-ink-2">· auto</span>}
          </button>
        );
      })}
    </div>
  );
}
