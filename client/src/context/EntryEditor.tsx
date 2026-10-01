import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Entry } from '@shared/types';
import { errorMessage } from '@/api/client';
import { useDeleteEntry } from '@/api/hooks';
import { EntryFormSheet } from '@/components/EntryFormSheet';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import { draftFromEntry, draftRepeating, emptyDraft, type Draft } from '@/lib/draft';
import { mealLabel } from '@/lib/meal';
import { relativeDayLabel } from '@/lib/format';
import { localDateTimeParts } from '@shared/dates';
import { useFeedback } from './Feedback';

type EditorState = { mode: 'quick' } | { mode: 'full'; draft: Draft; key: number } | null;

interface EntryEditorValue {
  openQuick: () => void;
  openNew: (options?: { date?: string }) => void;
  openEdit: (entry: Entry) => void;
  repeat: (entry: Entry) => void;
  isOpen: boolean;
}

const EntryEditorContext = createContext<EntryEditorValue | null>(null);

export function EntryEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState>(null);
  const { toast } = useFeedback();
  const remove = useDeleteEntry();

  const close = useCallback(() => setState(null), []);

  const openFull = useCallback((draft: Draft) => setState({ mode: 'full', draft, key: Date.now() }), []);

  const handleSaved = useCallback(
    (entry: Entry, isNew: boolean) => {
      setState(null);
      try {
        navigator.vibrate?.(12);
      } catch {
        /* sin vibración */
      }
      const [date, time] = entry.eatenAt.split('T');
      const today = localDateTimeParts(new Date()).date;
      const day = date === today ? '' : ` · ${relativeDayLabel(date, today)}`;
      toast({
        message: isNew ? `Guardado · ${mealLabel(entry.mealType)} a las ${time}${day}` : 'Cambios guardados',
        tone: 'success',
        action: isNew
          ? {
              label: 'Deshacer',
              onClick: () =>
                remove.mutate(
                  { id: entry.id, date },
                  { onError: (err) => toast({ message: errorMessage(err), tone: 'error' }) },
                ),
            }
          : undefined,
      });
    },
    [toast, remove],
  );

  const value = useMemo<EntryEditorValue>(
    () => ({
      openQuick: () => setState({ mode: 'quick' }),
      openNew: (options) => {
        const today = localDateTimeParts(new Date()).date;
        // Si se añade a otro día desde el calendario, se propone una hora y se marca como elegida.
        const draft =
          options?.date && options.date !== today
            ? emptyDraft({ date: options.date, time: '14:00', timeTouched: true })
            : emptyDraft();
        openFull(draft);
      },
      openEdit: (entry) => openFull(draftFromEntry(entry)),
      repeat: (entry) => openFull(draftRepeating(entry)),
      isOpen: state !== null,
    }),
    [openFull, state],
  );

  return (
    <EntryEditorContext.Provider value={value}>
      {children}
      {state?.mode === 'quick' && (
        <QuickAddSheet onClose={close} onSaved={(entry) => handleSaved(entry, true)} onMoreDetails={openFull} />
      )}
      {state?.mode === 'full' && (
        <EntryFormSheet key={state.key} initial={state.draft} onClose={close} onSaved={handleSaved} />
      )}
    </EntryEditorContext.Provider>
  );
}

export function useEntryEditor(): EntryEditorValue {
  const ctx = useContext(EntryEditorContext);
  if (!ctx) throw new Error('useEntryEditor debe usarse dentro de EntryEditorProvider');
  return ctx;
}
