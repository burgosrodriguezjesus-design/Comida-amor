import clsx from 'clsx';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

/** Menú contextual pequeño (⋯) con cierre al tocar fuera o con Escape. */
export function Menu({ trigger, items, label }: { trigger: ReactNode; items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-9 w-9 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className="animate-pop-in absolute top-full right-0 z-30 mt-1 min-w-48 overflow-hidden rounded-2xl border border-line bg-surface py-1.5 shadow-soft-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
              className={clsx(
                'flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] font-medium hover:bg-surface-2',
                item.danger ? 'text-danger' : 'text-ink',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
