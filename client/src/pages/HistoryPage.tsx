import clsx from 'clsx';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { MEAL_TYPES, MEAL_TYPE_IDS, type MealType } from '@shared/constants';
import { addDays, isValidDate } from '@shared/dates';
import type { Entry } from '@shared/types';
import { normalizeText } from '@shared/text';
import { errorMessage } from '@/api/client';
import { useFoods, useSearchEntries, type SearchFilters } from '@/api/hooks';
import { EntryRow } from '@/components/EntryCard';
import { SettingsLink } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import { StatsView } from '@/components/stats/StatsView';
import { Button, Chip, EmptyState, PageHeader, Segmented, Spinner, Switch } from '@/components/ui';
import { MEAL_ICONS, mealLabel } from '@/lib/meal';
import { numericDate, plural, relativeDayLabel, startOfMonth } from '@/lib/format';
import { useNow } from '@/lib/useNow';

function filtersFromParams(params: URLSearchParams): SearchFilters {
  const date = (key: string) => {
    const value = params.get(key) ?? '';
    return isValidDate(value) ? value : '';
  };
  return {
    q: params.get('q') ?? '',
    from: date('desde'),
    to: date('hasta'),
    types: (params.get('tipos') ?? '').split(',').filter((t): t is MealType => (MEAL_TYPE_IDS as string[]).includes(t)),
    food: params.get('alimento') ?? '',
    symptoms: params.get('sintomas') === '1',
    photos: params.get('fotos') === '1',
  };
}

function filtersToParams(filters: SearchFilters, base: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base);
  const set = (key: string, value: string) => (value ? p.set(key, value) : p.delete(key));
  set('q', filters.q);
  set('desde', filters.from);
  set('hasta', filters.to);
  set('tipos', filters.types.join(','));
  set('alimento', filters.food);
  set('sintomas', filters.symptoms ? '1' : '');
  set('fotos', filters.photos ? '1' : '');
  return p;
}

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('vista') === 'estadisticas' ? 'estadisticas' : 'registros';
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Historial" subtitle="Consulta todo lo que has registrado." actions={<SettingsLink />} />
      <Segmented
        label="Sección del historial"
        className="mb-5 w-full sm:w-auto"
        value={tab}
        onChange={(value) => {
          const p = new URLSearchParams(params);
          if (value === 'estadisticas') p.set('vista', 'estadisticas');
          else p.delete('vista');
          setParams(p, { replace: true });
        }}
        options={[
          { value: 'registros', label: 'Registros' },
          { value: 'estadisticas', label: 'Estadísticas' },
        ]}
      />
      {tab === 'registros' ? <EntriesSearch /> : <StatsView />}
    </div>
  );
}

function EntriesSearch() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const [text, setText] = useState(filters.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { date: today } = useNow();
  const navigate = useNavigate();
  const apply = (next: SearchFilters) => setParams(filtersToParams(next, params), { replace: true });

  // Búsqueda mientras se escribe (con una pequeña espera).
  useEffect(() => {
    if (text === filters.q) return;
    const id = window.setTimeout(() => apply({ ...filters, q: text }), 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const query = useSearchEntries(filters);
  const pages = query.data?.pages ?? [];
  const entries = pages.flatMap((p) => p.entries);
  const total = pages[0]?.total ?? 0;
  const dayCount = pages[0]?.dayCount ?? 0;

  const groups = useMemo(() => {
    const out: { date: string; entries: Entry[] }[] = [];
    for (const entry of entries) {
      const date = entry.eatenAt.slice(0, 10);
      const last = out[out.length - 1];
      if (last?.date === date) last.entries.push(entry);
      else out.push({ date, entries: [entry] });
    }
    // Dentro de cada día, orden cronológico.
    for (const group of out) group.entries.sort((a, b) => a.eatenAt.localeCompare(b.eatenAt));
    return out;
  }, [entries]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !query.hasNextPage) return;
    const observer = new IntersectionObserver((items) => {
      if (items[0].isIntersecting && !query.isFetchingNextPage) void query.fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query]);

  const activeChips: { label: string; clear: Partial<SearchFilters> }[] = [];
  if (filters.from || filters.to) {
    const label =
      filters.from && filters.from === filters.to
        ? `Día ${numericDate(filters.from)}`
        : `${filters.from ? numericDate(filters.from) : 'Inicio'} – ${filters.to ? numericDate(filters.to) : 'hoy'}`;
    activeChips.push({ label, clear: { from: '', to: '' } });
  }
  for (const type of filters.types) activeChips.push({ label: mealLabel(type), clear: { types: filters.types.filter((t) => t !== type) } });
  if (filters.food) activeChips.push({ label: `Alimento: ${filters.food}`, clear: { food: '' } });
  if (filters.symptoms) activeChips.push({ label: 'Con síntomas anotados', clear: { symptoms: false } });
  if (filters.photos) activeChips.push({ label: 'Con foto', clear: { photos: false } });
  const hasFilters = activeChips.length > 0 || filters.q.trim() !== '';

  return (
    <div>
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Buscar en tus registros</span>
          <Search size={19} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Buscar: pizza, café, hinchazón…"
            className="field h-12 pr-10 pl-11"
            enterKeyHint="search"
          />
          {text && (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              onClick={() => {
                setText('');
                apply({ ...filters, q: '' });
              }}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1.5 text-ink-3 hover:text-ink"
            >
              <X size={17} />
            </button>
          )}
        </label>
        <Button
          variant={activeChips.length ? 'primary' : 'secondary'}
          className="h-12"
          icon={<SlidersHorizontal size={18} />}
          onClick={() => setFiltersOpen(true)}
          aria-label={`Filtros${activeChips.length ? ` (${activeChips.length} activos)` : ''}`}
        >
          <span className="hidden sm:inline">Filtros</span>
          {activeChips.length > 0 && <span className="tabular-nums">{activeChips.length}</span>}
        </Button>
      </div>

      {activeChips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => apply({ ...filters, ...chip.clear })}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-soft pr-2.5 pl-3.5 text-sm font-semibold text-brand"
              aria-label={`Quitar filtro ${chip.label}`}
            >
              {chip.label} <X size={15} aria-hidden="true" />
            </button>
          ))}
          <button type="button" className="h-9 px-2 text-sm font-semibold text-ink-2 hover:text-ink" onClick={() => {
            setText('');
            apply({ q: '', from: '', to: '', types: [], food: '', symptoms: false, photos: false });
          }}>
            Quitar todo
          </button>
        </div>
      )}

      <div className="mt-5" aria-live="polite">
        {query.isPending ? (
          <Spinner />
        ) : query.isError ? (
          <EmptyState title="No se pudo buscar">{errorMessage(query.error)}</EmptyState>
        ) : total === 0 ? (
          <div className="card">
            <EmptyState icon={<Search size={26} />} title={hasFilters ? 'No hay registros que coincidan' : 'Todavía no hay registros'}>
              {hasFilters ? 'Prueba con otra palabra o quita algún filtro.' : 'Cuando registres comidas, aparecerán aquí.'}
            </EmptyState>
          </div>
        ) : (
          <>
            <p className="mb-4 text-[15px] text-ink-2">
              {filters.q.trim() ? (
                <>
                  «<strong className="text-ink">{filters.q.trim()}</strong>» aparece en{' '}
                  <strong className="text-ink">{plural(dayCount, 'día', 'días')}</strong> ({plural(total, 'registro', 'registros')})
                </>
              ) : (
                <>
                  {plural(total, 'registro', 'registros')} en {plural(dayCount, 'día', 'días')}
                </>
              )}
            </p>
            <div className="space-y-4">
              {groups.map((group) => (
                <section key={group.date} className="card p-2 sm:p-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/calendario?dia=${group.date}`)}
                    className="flex w-full items-center justify-between rounded-xl px-2 pt-1.5 pb-1 text-left hover:text-brand"
                  >
                    <h3 className="font-display text-lg font-semibold">{relativeDayLabel(group.date, today)}</h3>
                    <span className="text-[13px] text-ink-3">{plural(group.entries.length, 'registro', 'registros')}</span>
                  </button>
                  {group.entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} highlight={filters.q || filters.food} />
                  ))}
                </section>
              ))}
            </div>
            <div ref={sentinel} />
            {query.hasNextPage && (
              <div className="mt-5 text-center">
                <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                  Cargar más
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {filtersOpen && <FilterSheet initial={filters} today={today} onClose={() => setFiltersOpen(false)} onApply={(next) => {
        apply({ ...next, q: filters.q });
        setFiltersOpen(false);
      }} />}
    </div>
  );
}

function FilterSheet({
  initial,
  today,
  onClose,
  onApply,
}: {
  initial: SearchFilters;
  today: string;
  onClose: () => void;
  onApply: (filters: SearchFilters) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [foodQuery, setFoodQuery] = useState('');
  const foods = useFoods();
  const set = (patch: Partial<SearchFilters>) => setDraft((d) => ({ ...d, ...patch }));

  const ranges = [
    { label: 'Todo', from: '', to: '' },
    { label: 'Hoy', from: today, to: today },
    { label: 'Últimos 7 días', from: addDays(today, -6), to: today },
    { label: 'Últimos 30 días', from: addDays(today, -29), to: today },
    { label: 'Este mes', from: startOfMonth(today), to: today },
  ];

  const foodMatches = useMemo(() => {
    const q = normalizeText(foodQuery);
    const list = foods.data ?? [];
    return (q ? list.filter((f) => f.nameNorm.includes(q)) : list).slice(0, 12);
  }, [foods.data, foodQuery]);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Filtros"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDraft({ ...draft, from: '', to: '', types: [], food: '', symptoms: false, photos: false })}>
            Borrar filtros
          </Button>
          <Button className="flex-1" onClick={() => onApply(draft)}>
            Ver resultados
          </Button>
        </div>
      }
    >
      <div className="space-y-6 py-2">
        <section>
          <h3 className="label">Fecha o periodo</h3>
          <div className="mb-3 flex flex-wrap gap-2">
            {ranges.map((r) => (
              <Chip key={r.label} selected={draft.from === r.from && draft.to === r.to} onClick={() => set({ from: r.from, to: r.to })}>
                {r.label}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="mb-1 block text-[13px] text-ink-2">Desde</span>
              <input type="date" className="field py-2.5" value={draft.from} max={draft.to || today} onChange={(e) => set({ from: e.target.value })} />
            </label>
            <label>
              <span className="mb-1 block text-[13px] text-ink-2">Hasta</span>
              <input type="date" className="field py-2.5" value={draft.to} min={draft.from || undefined} max={today} onChange={(e) => set({ to: e.target.value })} />
            </label>
          </div>
          <p className="mt-1.5 text-[13px] text-ink-3">Para un día concreto, pon la misma fecha en los dos campos.</p>
        </section>

        <section>
          <h3 className="label">Tipo de comida</h3>
          <div className="flex flex-wrap gap-2">
            {MEAL_TYPES.map((type) => {
              const Icon = MEAL_ICONS[type.id];
              const selected = draft.types.includes(type.id);
              return (
                <Chip
                  key={type.id}
                  selected={selected}
                  icon={<Icon size={15} aria-hidden="true" />}
                  onClick={() => set({ types: selected ? draft.types.filter((t) => t !== type.id) : [...draft.types, type.id] })}
                >
                  {type.label}
                </Chip>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="label">Alimento o bebida</h3>
          {draft.food ? (
            <button
              type="button"
              onClick={() => set({ food: '' })}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-bg"
            >
              {draft.food} <X size={15} aria-label="Quitar" />
            </button>
          ) : (
            <>
              <input
                className="field"
                value={foodQuery}
                onChange={(e) => setFoodQuery(e.target.value)}
                placeholder="Busca entre lo que has registrado"
                aria-label="Buscar alimento"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {foodMatches.map((food) => (
                  <Chip key={food.nameNorm} onClick={() => set({ food: food.name })}>
                    {food.name} <span className="text-ink-3">{food.count}</span>
                  </Chip>
                ))}
              </div>
            </>
          )}
        </section>

        <section className={clsx('space-y-3 rounded-3xl bg-surface p-4 shadow-soft-sm')}>
          <Switch checked={draft.symptoms} onChange={(symptoms) => set({ symptoms })} label="Solo con síntomas anotados" />
          <Switch checked={draft.photos} onChange={(photos) => set({ photos })} label="Solo con foto" />
        </section>
      </div>
    </Sheet>
  );
}
