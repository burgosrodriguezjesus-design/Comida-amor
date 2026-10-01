import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  CalendarResponse,
  Entry,
  EntryInput,
  EntryListResponse,
  FoodOption,
  ReminderSettings,
  StatsResponse,
  SuggestionsResponse,
  User,
} from '@shared/types';
import type { MealType } from '@shared/constants';
import { api, qs } from './client';

export const qk = {
  me: ['me'] as const,
  authOptions: ['auth-options'] as const,
  day: (date: string) => ['entries', 'day', date] as const,
  range: (from: string, to: string) => ['entries', 'range', from, to] as const,
  search: (filters: SearchFilters) => ['entries', 'search', filters] as const,
  calendar: (from: string, to: string) => ['calendar', from, to] as const,
  suggestions: (time: string) => ['suggestions', time] as const,
  foods: ['foods'] as const,
  stats: (from: string, to: string) => ['stats', from, to] as const,
  reminders: ['reminders'] as const,
};

// ---------- Sesión ----------

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>('/api/auth/me')).user;
      } catch (error) {
        if ((error as { status?: number }).status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useAuthOptions() {
  return useQuery({
    queryKey: qk.authOptions,
    queryFn: () => api.get<{ demoEnabled: boolean; registrationEnabled: boolean }>('/api/auth/options'),
    staleTime: Infinity,
  });
}

// ---------- Registros ----------

const DAY_LIMIT = 500;

export function useDayEntries(date: string) {
  return useQuery({
    queryKey: qk.day(date),
    queryFn: async () =>
      (await api.get<EntryListResponse>(`/api/entries${qs({ from: date, to: date, order: 'asc', limit: DAY_LIMIT })}`)).entries,
  });
}

export function useRangeEntries(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: qk.range(from, to),
    queryFn: async () => {
      const all: Entry[] = [];
      for (let offset = 0; ; offset += 2000) {
        const page = await api.get<EntryListResponse>(`/api/entries${qs({ from, to, order: 'asc', limit: 2000, offset })}`);
        all.push(...page.entries);
        if (!page.hasMore) break;
      }
      return all;
    },
    enabled,
  });
}

export interface SearchFilters {
  q: string;
  from: string;
  to: string;
  types: MealType[];
  food: string;
  symptoms: boolean;
  photos: boolean;
}

const PAGE = 40;

export function useSearchEntries(filters: SearchFilters) {
  return useInfiniteQuery({
    queryKey: qk.search(filters),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<EntryListResponse>(
        `/api/entries${qs({
          q: filters.q.trim(),
          from: filters.from,
          to: filters.to,
          types: filters.types,
          food: filters.food,
          symptoms: filters.symptoms,
          photos: filters.photos,
          limit: PAGE,
          offset: pageParam,
        })}`,
      ),
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length * PAGE : undefined),
    placeholderData: (prev) => prev,
  });
}

export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: qk.calendar(from, to),
    queryFn: () => api.get<CalendarResponse>(`/api/calendar${qs({ from, to })}`),
    placeholderData: (prev) => prev,
  });
}

export function useSuggestions(time: string, enabled = true) {
  // La clave usa solo la hora (no los minutos) para no recalcular a cada minuto.
  const hour = time.slice(0, 2);
  return useQuery({
    queryKey: qk.suggestions(hour),
    queryFn: () => api.get<SuggestionsResponse>(`/api/suggestions${qs({ time })}`),
    staleTime: 60_000,
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useFoods(enabled = true) {
  return useQuery({
    queryKey: qk.foods,
    queryFn: async () => (await api.get<{ foods: FoodOption[] }>('/api/foods')).foods,
    staleTime: 60_000,
    enabled,
  });
}

export function useStats(from: string, to: string) {
  return useQuery({
    queryKey: qk.stats(from, to),
    queryFn: () => api.get<StatsResponse>(`/api/stats${qs({ from, to })}`),
    placeholderData: (prev) => prev,
  });
}

function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => a.eatenAt.localeCompare(b.eatenAt) || a.createdAt.localeCompare(b.createdAt));
}

/** Tras guardar, se actualiza al instante el día afectado y se refresca el resto en segundo plano. */
export function applyEntryChange(client: QueryClient, entry: Entry | null, removedId?: string, previousDate?: string) {
  const touchDay = (date: string, fn: (list: Entry[]) => Entry[]) => {
    client.setQueryData<Entry[]>(qk.day(date), (old) => (old ? fn(old) : old));
  };
  if (removedId && previousDate) touchDay(previousDate, (list) => list.filter((e) => e.id !== removedId));
  if (entry) {
    if (previousDate && previousDate !== entry.eatenAt.slice(0, 10)) {
      touchDay(previousDate, (list) => list.filter((e) => e.id !== entry.id));
    }
    touchDay(entry.eatenAt.slice(0, 10), (list) => sortEntries([...list.filter((e) => e.id !== entry.id), entry]));
  }
  for (const key of [['entries'], ['calendar'], ['suggestions'], ['foods'], ['stats']]) {
    void client.invalidateQueries({ queryKey: key });
  }
}

export function useCreateEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: EntryInput) => (await api.post<{ entry: Entry }>('/api/entries', input)).entry,
    onSuccess: (entry) => applyEntryChange(client, entry),
  });
}

export function useUpdateEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: EntryInput; previousDate: string }) =>
      (await api.put<{ entry: Entry }>(`/api/entries/${id}`, input)).entry,
    onSuccess: (entry, vars) => applyEntryChange(client, entry, undefined, vars.previousDate),
  });
}

export function useDeleteEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; date: string }) => api.del<{ ok: true }>(`/api/entries/${id}`),
    onSuccess: (_res, { id, date }) => applyEntryChange(client, null, id, date),
  });
}

// ---------- Recordatorios ----------

export function useReminders() {
  return useQuery({ queryKey: qk.reminders, queryFn: () => api.get<ReminderSettings>('/api/reminders') });
}

export function useSaveReminders() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: Pick<ReminderSettings, 'enabled' | 'quietMinutes' | 'times'>) =>
      api.put<ReminderSettings>('/api/reminders', settings),
    onSuccess: (data) => client.setQueryData(qk.reminders, data),
  });
}

export function entryToInput(entry: Entry): EntryInput {
  return {
    eatenAt: entry.eatenAt,
    mealType: entry.mealType,
    items: entry.items.map(({ name, quantity, kind }) => ({ name, quantity, kind })),
    notes: entry.notes,
    feelingNote: entry.feelingNote,
    symptoms: entry.symptoms,
    otherSymptoms: entry.otherSymptoms,
    photoIds: entry.photos.map((p) => p.id),
  };
}
