import { Droplet, Plus, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { EntryInput } from '@shared/types';
import { localDateTimeParts } from '@shared/dates';
import { errorMessage } from '@/api/client';
import { useCreateEntry, useDayEntries, useDeleteEntry, useMe, useSuggestions } from '@/api/hooks';
import { EntryTimeline } from '@/components/EntryCard';
import { SettingsLink } from '@/components/Layout';
import { Button, EmptyState, SectionTitle, Spinner } from '@/components/ui';
import { useEntryEditor } from '@/context/EntryEditor';
import { useFeedback } from '@/context/Feedback';
import { greeting, longDate, plural } from '@/lib/format';
import { useNow } from '@/lib/useNow';

export function TodayPage() {
  const { date, time } = useNow();
  const me = useMe();
  const day = useDayEntries(date);
  const { openNew, openQuick } = useEntryEditor();
  const navigate = useNavigate();
  const entries = day.data ?? [];
  const firstName = me.data?.name.split(' ')[0] ?? '';

  const drinks = useMemo(
    () => entries.flatMap((e) => e.items.filter((i) => i.kind === 'drink').map((i) => ({ ...i, time: e.eatenAt.slice(11, 16), entry: e }))),
    [entries],
  );

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold tracking-[0.08em] text-brand uppercase">Hoy · {longDate(date)}</p>
          <h1 className="mt-1 font-display text-[2rem] leading-tight font-semibold tracking-tight text-ink">
            {greeting(time)}
            {firstName ? `, ${firstName}` : ''}
          </h1>
        </div>
        <SettingsLink />
      </header>

      <Button size="xl" className="w-full rounded-3xl text-[1.15rem]" icon={<Plus size={24} strokeWidth={2.6} />} onClick={() => openNew()}>
        Añadir comida
      </Button>

      {entries.length > 0 && (
        <p className="mt-4 text-center text-sm text-ink-2">
          {plural(entries.length, 'registro', 'registros')} hoy · {plural(drinks.length, 'bebida', 'bebidas')} · último a las{' '}
          {entries[entries.length - 1].eatenAt.slice(11, 16)}
        </p>
      )}

      <section className="mt-8" aria-labelledby="hoy-titulo">
        <SectionTitle>
          <span id="hoy-titulo">Lo que has comido hoy</span>
        </SectionTitle>
        {day.isPending ? (
          <Spinner />
        ) : day.isError ? (
          <EmptyState title="No se ha podido cargar el día">{errorMessage(day.error)}</EmptyState>
        ) : entries.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Sparkles size={28} />}
              title="Aún no has registrado nada hoy"
              action={
                <Button variant="soft" onClick={openQuick}>
                  Hacer un registro rápido
                </Button>
              }
            >
              Cuando comas o bebas algo, apúntalo aquí. Solo tardarás unos segundos.
            </EmptyState>
          </div>
        ) : (
          <EntryTimeline entries={entries} />
        )}
      </section>

      <DrinksSection drinks={drinks} />

      {entries.length > 0 && (
        <p className="mt-8 text-center text-sm text-ink-3">
          ¿Quieres ver otro día?{' '}
          <button type="button" className="font-semibold text-brand" onClick={() => navigate('/calendario')}>
            Abrir el calendario
          </button>
        </p>
      )}
    </div>
  );
}

function DrinksSection({ drinks }: { drinks: { name: string; quantity: string; time: string }[] }) {
  const { time } = useNow();
  const suggestions = useSuggestions(time);
  const create = useCreateEntry();
  const remove = useDeleteEntry();
  const { toast } = useFeedback();
  const frequent = (suggestions.data?.items ?? []).filter((i) => i.kind === 'drink').slice(0, 3);

  // Un toque: registra la bebida al momento.
  const quickDrink = async (name: string, quantity: string) => {
    const now = localDateTimeParts(new Date());
    const input: EntryInput = { eatenAt: `${now.date}T${now.time}`, mealType: 'bebida', items: [{ name, quantity, kind: 'drink' }] };
    try {
      const entry = await create.mutateAsync(input);
      toast({
        message: `${name} · registrado a las ${now.time}`,
        tone: 'success',
        action: { label: 'Deshacer', onClick: () => remove.mutate({ id: entry.id, date: now.date }) },
      });
      return entry;
    } catch (err) {
      toast({ message: errorMessage(err), tone: 'error' });
    }
  };

  return (
    <section className="mt-10" aria-labelledby="bebidas-titulo">
      <SectionTitle>
        <span id="bebidas-titulo">Bebidas de hoy</span>
      </SectionTitle>
      <div className="card p-4">
        {drinks.length === 0 ? (
          <p className="text-[15px] text-ink-2">Todavía no has anotado ninguna bebida.</p>
        ) : (
          <ul className="divide-y divide-line">
            {drinks.map((drink, index) => (
              <li key={`${drink.time}-${drink.name}-${index}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="w-12 text-[15px] font-bold tabular-nums">{drink.time}</span>
                <Droplet size={16} className="shrink-0 text-drink" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-[15px]">
                  {drink.name}
                  {drink.quantity && <span className="text-ink-3"> · {drink.quantity}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {frequent.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-sm text-ink-2">Registrar con un toque:</p>
            <div className="flex flex-wrap gap-2">
              {frequent.map((drink) => (
                <button
                  key={drink.nameNorm}
                  type="button"
                  disabled={create.isPending}
                  onClick={() => void quickDrink(drink.name, drink.quantity)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-drink-soft px-3.5 text-sm font-semibold text-drink transition-transform active:scale-95 disabled:opacity-60"
                >
                  <Plus size={15} aria-hidden="true" /> {drink.name}
                  {drink.quantity && <span className="font-normal opacity-80">· {drink.quantity}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
