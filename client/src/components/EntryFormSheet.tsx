import { ChevronDown, HeartPulse, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Entry } from '@shared/types';
import { api, errorMessage } from '@/api/client';
import { useCreateEntry, useDeleteEntry, useFoods, useSuggestions, useUpdateEntry } from '@/api/hooks';
import { useFeedback } from '@/context/Feedback';
import {
  draftHasContent,
  draftItems,
  draftToInput,
  effectiveMealType,
  emptyItem,
  type Draft,
  type DraftPhoto,
} from '@/lib/draft';
import { mealLabel } from '@/lib/meal';
import { ItemListEditor } from './form/ItemListEditor';
import { MealTypePicker } from './form/MealTypePicker';
import { PhotoPicker } from './form/PhotoPicker';
import { SymptomPicker } from './form/SymptomPicker';
import { WhenFields } from './form/WhenFields';
import { Sheet } from './Sheet';
import { Button, IconButton } from './ui';

/** Formulario completo para añadir o editar una comida. */
export function EntryFormSheet({
  initial,
  onClose,
  onSaved,
}: {
  initial: Draft;
  onClose: () => void;
  onSaved: (entry: Entry, isNew: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [showFeeling, setShowFeeling] = useState(
    initial.symptoms.length > 0 || initial.feelingNote.trim() !== '',
  );
  const uploaded = useRef(new Set<string>());
  const saved = useRef(false);
  const { toast, confirm } = useFeedback();
  const foods = useFoods();
  const suggestions = useSuggestions(draft.time);
  const create = useCreateEntry();
  const update = useUpdateEntry();
  const remove = useDeleteEntry();
  const isEdit = Boolean(draft.id);
  const initialSnapshot = useMemo(() => JSON.stringify(draftToInput(initial)), [initial]);

  // Fotos subidas en esta sesión que no llegaron a guardarse: se borran al salir.
  useEffect(
    () => () => {
      if (saved.current) return;
      for (const id of uploaded.current) void api.del(`/api/photos/${id}`).catch(() => undefined);
    },
    [],
  );

  const set = (patch: Partial<Draft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setPhotos = (fn: (photos: DraftPhoto[]) => DraftPhoto[]) => setDraft((d) => ({ ...d, photos: fn(d.photos) }));

  const mealType = effectiveMealType(draft);
  const uploading = draft.photos.some((p) => p.uploading);
  const saving = create.isPending || update.isPending;

  const requestClose = async () => {
    const dirty = isEdit ? JSON.stringify(draftToInput(draft)) !== initialSnapshot : draftHasContent(draft);
    if (dirty) {
      const discard = await confirm({
        title: '¿Descartar los cambios?',
        message: 'Lo que has escrito en este registro no se guardará.',
        confirmLabel: 'Descartar',
        cancelLabel: 'Seguir editando',
        danger: true,
      });
      if (!discard) return;
    }
    onClose();
  };

  const submit = async () => {
    if (uploading) {
      setError('Espera a que terminen de subirse las fotos.');
      return;
    }
    const input = draftToInput(draft);
    if (input.items.length === 0 && !input.notes) {
      setError('Escribe al menos un alimento o una bebida.');
      return;
    }
    try {
      const entry = isEdit
        ? await update.mutateAsync({ id: draft.id!, input, previousDate: draft.originalDate ?? draft.date })
        : await create.mutateAsync(input);
      saved.current = true;
      onSaved(entry, !isEdit);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: '¿Eliminar este registro?',
      message: 'Se borrará definitivamente, junto con sus fotos.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok || !draft.id) return;
    try {
      await remove.mutateAsync({ id: draft.id, date: draft.originalDate ?? draft.date });
      saved.current = true;
      toast({ message: 'Registro eliminado' });
      onClose();
    } catch (err) {
      toast({ message: errorMessage(err), tone: 'error' });
    }
  };

  const drinkPicks = (suggestions.data?.items ?? []).filter((i) => i.kind === 'drink');
  const foodPicks = (suggestions.data?.items ?? []).filter((i) => i.kind === 'food');
  const itemCount = draftItems(draft).length;

  return (
    <Sheet
      open
      onClose={requestClose}
      title={isEdit ? 'Editar registro' : 'Añadir comida'}
      description={isEdit ? undefined : 'Solo es obligatorio lo que has comido o bebido.'}
      footer={
        <div className="flex items-center gap-3">
          {isEdit && (
            <IconButton label="Eliminar registro" onClick={handleDelete} className="h-14 w-14 rounded-2xl bg-danger-soft text-danger hover:bg-danger-soft">
              <Trash2 size={20} />
            </IconButton>
          )}
          <Button size="xl" className="flex-1" onClick={submit} loading={saving} disabled={uploading}>
            {isEdit ? 'Guardar cambios' : 'Guardar'}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-6 pt-2 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <section>
          <span className="label">Tipo de comida</span>
          <MealTypePicker value={mealType} isAuto={draft.mealType === null} onChange={(value) => set({ mealType: value })} />
          {draft.mealType === null && (
            <p className="mt-1.5 text-[13px] text-ink-3">Sugerido por la hora: {mealLabel(mealType)}. Tócalo para cambiarlo.</p>
          )}
        </section>

        <section>
          <span className="label">Cuándo</span>
          <WhenFields
            date={draft.date}
            time={draft.time}
            touched={draft.timeTouched}
            onChange={({ date, time, touched }) => set({ date, time, timeTouched: touched })}
          />
        </section>

        <section className="space-y-5">
          <ItemListEditor
            kind="food"
            items={draft.foods}
            onChange={(foodsList) => set({ foods: foodsList })}
            foods={foods.data ?? []}
            quickPicks={draft.foods.some((f) => f.name.trim()) ? [] : foodPicks}
          />
          <ItemListEditor
            kind="drink"
            items={draft.drinks}
            onChange={(drinks) => set({ drinks })}
            foods={foods.data ?? []}
            quickPicks={drinkPicks}
          />
        </section>

        <section>
          <span className="label">Foto (opcional)</span>
          <PhotoPicker photos={draft.photos} onChange={setPhotos} onUploaded={(id) => uploaded.current.add(id)} />
        </section>

        <section>
          <label className="label" htmlFor="entry-notes">
            Notas (opcional)
          </label>
          <textarea
            id="entry-notes"
            className="field min-h-20 resize-y"
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Dónde comiste, con quién, cómo estaba cocinado…"
            maxLength={2000}
          />
        </section>

        <section className="rounded-3xl bg-surface p-4 shadow-soft-sm">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={showFeeling}
            onClick={() => setShowFeeling((v) => !v)}
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
                <HeartPulse size={18} />
              </span>
              <span>
                <span className="block font-semibold text-ink">¿Quieres añadir cómo te encontrabas?</span>
                <span className="block text-sm text-ink-2">Completamente opcional</span>
              </span>
            </span>
            <ChevronDown size={20} className={`shrink-0 text-ink-3 transition-transform ${showFeeling ? 'rotate-180' : ''}`} />
          </button>
          {showFeeling && (
            <div className="animate-pop-in mt-4 space-y-3">
              <SymptomPicker
                value={draft.symptoms}
                onChange={(symptoms) => set({ symptoms })}
                otherText={draft.otherSymptoms}
                onOtherTextChange={(otherSymptoms) => set({ otherSymptoms })}
              />
              <textarea
                className="field min-h-20 resize-y"
                value={draft.feelingNote}
                onChange={(e) => set({ feelingNote: e.target.value })}
                placeholder="Escribe con tus palabras cómo te encontrabas (opcional)"
                aria-label="Cómo te encontrabas"
                maxLength={2000}
              />
              <p className="text-[13px] leading-snug text-ink-3">
                Solo se guarda para que puedas enseñárselo a tu médico. La aplicación no saca conclusiones ni hace diagnósticos.
              </p>
            </div>
          )}
        </section>

        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        {itemCount === 0 && draft.foods.length === 0 && draft.drinks.length === 0 && (
          <button type="button" className="text-sm font-semibold text-brand" onClick={() => set({ foods: [emptyItem()] })}>
            + Añadir alimento
          </button>
        )}
      </form>
    </Sheet>
  );
}
