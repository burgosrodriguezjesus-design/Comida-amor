import {
  Apple,
  CircleEllipsis,
  Coffee,
  Cookie,
  Croissant,
  GlassWater,
  Soup,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { MEAL_TYPE_LABELS, type MealType } from '@shared/constants';

export const MEAL_ICONS: Record<MealType, LucideIcon> = {
  desayuno: Coffee,
  media_manana: Croissant,
  comida: UtensilsCrossed,
  merienda: Cookie,
  cena: Soup,
  snack: Apple,
  bebida: GlassWater,
  otro: CircleEllipsis,
};

export function mealColor(type: MealType) {
  return { color: `var(--meal-${type})`, background: `var(--meal-${type}-soft)` };
}

export function MealBadge({ type, size = 'md' }: { type: MealType; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = MEAL_ICONS[type];
  const box = size === 'sm' ? 'h-7 w-7 rounded-xl' : size === 'lg' ? 'h-12 w-12 rounded-2xl' : 'h-10 w-10 rounded-2xl';
  const icon = size === 'sm' ? 15 : size === 'lg' ? 24 : 20;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box}`} style={mealColor(type)} aria-hidden="true">
      <Icon size={icon} strokeWidth={2} />
    </span>
  );
}

export const mealLabel = (type: MealType) => MEAL_TYPE_LABELS[type];
