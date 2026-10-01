import clsx from 'clsx';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui';

interface ToastOptions {
  message: string;
  tone?: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface FeedbackContextValue {
  toast: (options: ToastOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<(ToastOptions & { id: number })[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (options: ToastOptions) => {
      counter.current += 1;
      const id = counter.current;
      setToasts([{ ...options, id }]);
      window.setTimeout(() => dismiss(id), options.duration ?? (options.action ? 6000 : 3200));
    },
    [dismiss],
  );

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })),
    [],
  );

  const closeConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="animate-toast-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-bg shadow-soft-lg"
          >
            {t.tone === 'error' ? (
              <CircleAlert size={20} className="shrink-0 text-[#ffb4a6] dark:text-danger" aria-hidden="true" />
            ) : (
              <CircleCheck size={20} className={clsx('animate-check-pop shrink-0', 'text-[#9fe0b2] dark:text-ok')} aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 text-[15px] font-medium">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="rounded-xl px-2.5 py-1.5 text-sm font-bold text-[#ffc7b8] hover:bg-white/10 dark:text-brand dark:hover:bg-black/10"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" aria-label="Cerrar aviso" className="rounded-full p-1 opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      <Sheet
        open={confirmState !== null}
        onClose={() => closeConfirm(false)}
        title={confirmState?.title ?? ''}
        size="sm"
        footer={
          // En móvil, botones grandes uno encima de otro (el principal arriba); en pantallas anchas, en fila.
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              size="xl"
              variant={confirmState?.danger ? 'danger' : 'primary'}
              className="w-full sm:order-2"
              onClick={() => closeConfirm(true)}
            >
              {confirmState?.confirmLabel ?? 'Aceptar'}
            </Button>
            <Button size="xl" variant="secondary" className="w-full sm:order-1" onClick={() => closeConfirm(false)}>
              {confirmState?.cancelLabel ?? 'Cancelar'}
            </Button>
          </div>
        }
      >
        {confirmState?.message && <div className="pb-2 text-[15px] leading-relaxed text-ink-2">{confirmState.message}</div>}
      </Sheet>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback debe usarse dentro de FeedbackProvider');
  return ctx;
}
