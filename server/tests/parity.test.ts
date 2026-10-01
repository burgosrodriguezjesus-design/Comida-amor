// La versión del navegador usa consultas en memoria (shared/queries.ts).
// Estas pruebas comprueban que dan los mismos resultados que el servidor.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, nowInTimeZone } from '../../shared/dates';
import { calendarFromEntries, foodOptionsFromEntries, queryEntries, statsFromEntries, suggestionsFromEntries } from '../../shared/queries';
import type { Entry } from '../../shared/types';
import { createTestContext } from './helpers';

let t: ReturnType<typeof createTestContext>;
let agent: ReturnType<ReturnType<typeof createTestContext>['agent']>;
let all: Entry[];
const today = nowInTimeZone('Europe/Madrid').date;

beforeAll(async () => {
  t = createTestContext();
  agent = t.agent();
  await agent.post('/api/auth/demo').send({ timezone: 'Europe/Madrid' });
  all = (await agent.get('/api/entries?order=asc&limit=5000')).body.entries;
});
afterAll(() => t.cleanup());

describe('consultas en memoria = consultas del servidor', () => {
  it('estadísticas', async () => {
    const from = addDays(today, -29);
    const server = (await agent.get(`/api/stats?from=${from}&to=${today}`)).body;
    const local = statsFromEntries(all, from, today);
    const bySymptom = (list: { code: string }[]) => [...list].sort((a, b) => a.code.localeCompare(b.code));
    expect({ ...local, symptoms: bySymptom(local.symptoms) }).toEqual({ ...server, symptoms: bySymptom(server.symptoms) });
  });

  it('calendario', async () => {
    const from = addDays(today, -40);
    const server = (await agent.get(`/api/calendar?from=${from}&to=${today}`)).body;
    expect(calendarFromEntries(all, from, today)).toEqual(server);
  });

  it('búsqueda y filtros', async () => {
    for (const qs of ['q=pizza', 'q=CAFE%20leche', 'types=cena,comida&symptoms=1', 'photos=1', `from=${addDays(today, -6)}&to=${today}`]) {
      const server = (await agent.get(`/api/entries?${qs}&limit=500`)).body;
      const params = new URLSearchParams(qs);
      const local = queryEntries(all, {
        q: params.get('q') ?? undefined,
        types: (params.get('types')?.split(',') ?? []) as Entry['mealType'][],
        symptoms: params.get('symptoms') === '1',
        photos: params.get('photos') === '1',
        from: params.get('from') ?? undefined,
        to: params.get('to') ?? undefined,
        limit: 500,
      });
      expect(local.total, qs).toBe(server.total);
      expect(local.dayCount, qs).toBe(server.dayCount);
      expect(local.entries.map((e) => e.id), qs).toEqual(server.entries.map((e: Entry) => e.id));
    }
  });

  it('alimentos y sugerencias', async () => {
    const server = (await agent.get('/api/foods')).body.foods as { nameNorm: string; count: number }[];
    const local = foodOptionsFromEntries(all);
    expect(local.map((f) => [f.nameNorm, f.count])).toEqual(server.map((f) => [f.nameNorm, f.count]));
    const sugServer = (await agent.get('/api/suggestions?time=14:30')).body;
    const sugLocal = suggestionsFromEntries(all, '14:30', today);
    // Mismas sugerencias; el orden entre empates (misma puntuación y misma fecha) puede variar.
    expect(sugLocal.items.map((i) => i.nameNorm).sort()).toEqual(sugServer.items.map((i: { nameNorm: string }) => i.nameNorm).sort());
    expect(sugLocal.meals.length).toBe(sugServer.meals.length);
  });
});
