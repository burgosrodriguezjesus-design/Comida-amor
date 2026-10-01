import clsx from 'clsx';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './ui';

let openSheets = 0;

/**
 * Hoja inferior en móvil y ventana centrada en pantallas grandes.
 * Cierra con Escape o tocando fuera; bloquea el scroll del fondo.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  initialFocus,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  initialFocus?: React.RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    openSheets += 1;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const focusTimer = window.setTimeout(() => {
      (initialFocus?.current ?? panelRef.current)?.focus({ preventScroll: true });
    }, 30);
    return () => {
      openSheets -= 1;
      if (openSheets === 0) document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(focusTimer);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, initialFocus]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="animate-fade-in absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          'animate-sheet-up sm:animate-pop-in relative flex max-h-[94dvh] w-full flex-col rounded-t-[2rem] bg-bg shadow-soft-lg outline-none sm:max-h-[90dvh] sm:rounded-[2rem]',
          { 'sm:max-w-md': size === 'sm', 'sm:max-w-xl': size === 'md', 'sm:max-w-3xl': size === 'lg' },
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden="true" />
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-3 pb-2 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-2xl font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
          </div>
          <IconButton label="Cerrar" onClick={onClose} className="-mr-2 bg-surface-2">
            <X size={20} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6">{children}</div>
        {footer && <div className="shrink-0 border-t border-line bg-bg px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-b-[2rem] sm:px-6 sm:pb-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
