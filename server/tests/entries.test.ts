import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, registerUser, sampleEntry, TINY_JPEG } from './helpers';

let t: ReturnType<typeof createTestContext>;
beforeEach(() => {
  t = createTestContext();
});
afterEach(() => t.cleanup());

describe('registros', () => {
  it('crea, lee, edita y elimina un registro', async () => {
    const agent = t.agent();
    await registerUser(agent);
    const created = await agent.post('/api/entries').send(sampleEntry());
    expect(created.status).toBe(201);
    const entry = created.body.entry;
    expect(entry.eatenAt).toBe('2026-10-01T08:32');
    expect(entry.items[0].name).toBe('Café con leche'); // primera letra en mayúscula

    const day = await agent.get('/api/entries?from=2026-10-01&to=2026-10-01&order=asc');
    expect(day.body.entries).toHaveLength(1);

    const updated = await agent.put(`/api/entries/${entry.id}`).send(
      sampleEntry({ eatenAt: '2026-10-01T09:00', mealType: 'media_manana', items: [{ name: 'Plátano', quantity: '1', kind: 'food' }] }),
    );
    expect(updated.status).toBe(200);
    expect(updated.body.entry.mealType).toBe('media_manana');
    expect(updated.body.entry.items).toHaveLength(1);

    await agent.delete(`/api/entries/${entry.id}`).expect(200);
    await agent.get(`/api/entries/${entry.id}`).expect(404);
  });

  it('valida los datos con mensajes en español', async () => {
    const agent = t.agent();
    await registerUser(agent);
    const empty = await agent.post('/api/entries').send(sampleEntry({ items: [], notes: '' }));
    expect(empty.status).toBe(400);
    expect(empty.body.error).toMatch(/al menos un alimento/);
    const badDate = await agent.post('/api/entries').send(sampleEntry({ eatenAt: '2026-02-30T08:00' }));
    expect(badDate.status).toBe(400);
  });

  it('"Sin síntomas" es excluyente con otros síntomas', async () => {
    const agent = t.agent();
    await registerUser(agent);
    const res = await agent.post('/api/entries').send(sampleEntry({ symptoms: ['sin_sintomas', 'acidez'] }));
    expect(res.body.entry.symptoms).toEqual(['acidez']);
    const other = await agent.post('/api/entries').send(sampleEntry({ symptoms: [], otherSymptoms: 'Mareo' }));
    expect(other.body.entry.symptoms).toEqual(['otros']);
  });

  it('busca sin distinguir tildes ni mayúsculas y filtra', async () => {
    const agent = t.agent();
    await registerUser(agent);
    await agent.post('/api/entries').send(sampleEntry());
    await agent.post('/api/entries').send(
      sampleEntry({ eatenAt: '2026-09-29T21:30', mealType: 'cena', items: [{ name: 'Pizza margarita', quantity: '', kind: 'food' }], symptoms: ['acidez'] }),
    );
    expect((await agent.get('/api/entries?q=CAFE')).body.total).toBe(1);
    expect((await agent.get('/api/entries?q=pizza')).body.total).toBe(1);
    expect((await agent.get('/api/entries?q=acidez')).body.total).toBe(1);
    expect((await agent.get('/api/entries?types=cena')).body.total).toBe(1);
    expect((await agent.get('/api/entries?symptoms=1')).body.total).toBe(1);
    expect((await agent.get('/api/entries?food=pizza%20margarita')).body.total).toBe(1);
    expect((await agent.get('/api/entries?from=2026-09-30&to=2026-10-31')).body.total).toBe(1);
    expect((await agent.get('/api/entries?q=100%25')).body.total).toBe(0); // los comodines se escapan
  });

  it('aísla los datos entre cuentas', async () => {
    const ana = t.agent();
    await registerUser(ana);
    const entry = (await ana.post('/api/entries').send(sampleEntry())).body.entry;
    const photo = (await ana.post('/api/photos').attach('photo', TINY_JPEG, 'foto.jpg')).body.photo;

    const eva = t.agent();
    await registerUser(eva, 'eva@example.com', 'Eva');
    expect((await eva.get('/api/entries')).body.total).toBe(0);
    await eva.get(`/api/entries/${entry.id}`).expect(404);
    await eva.put(`/api/entries/${entry.id}`).send(sampleEntry()).expect(404);
    await eva.delete(`/api/entries/${entry.id}`).expect(404);
    await eva.get(`/api/photos/${photo.id}`).expect(404);
    const steal = await eva.post('/api/entries').send(sampleEntry({ photoIds: [photo.id] }));
    expect(steal.status).toBe(400);
  });

  it('sube fotos, las vincula al registro y las borra al quitarlas', async () => {
    const agent = t.agent();
    await registerUser(agent);
    const up = await agent.post('/api/photos').attach('photo', TINY_JPEG, 'foto.jpg').attach('thumb', TINY_JPEG, 'mini.jpg');
    expect(up.status).toBe(201);
    const photoId = up.body.photo.id;
    const entry = (await agent.post('/api/entries').send(sampleEntry({ photoIds: [photoId] }))).body.entry;
    expect(entry.photos).toHaveLength(1);
    const img = await agent.get(`/api/photos/${photoId}?size=thumb`);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.headers['cache-control']).toMatch(/private/);

    await agent.put(`/api/entries/${entry.id}`).send(sampleEntry({ photoIds: [] })).expect(200);
    await agent.get(`/api/photos/${photoId}`).expect(404);

    const notImage = await agent.post('/api/photos').attach('photo', Buffer.from('<script>alert(1)</script>'), 'x.jpg');
    expect(notImage.status).toBe(400);
  });

  it('devuelve calendario, sugerencias, alimentos y estadísticas', async () => {
    const agent = t.agent();
    await registerUser(agent);
    await agent.post('/api/entries').send(sampleEntry());
    await agent.post('/api/entries').send(sampleEntry({ eatenAt: '2026-10-02T08:10' }));
    await agent.post('/api/entries').send(
      sampleEntry({ eatenAt: '2026-10-02T14:30', mealType: 'comida', items: [{ name: 'Lentejas', quantity: '1 plato', kind: 'food' }, { name: 'Agua', quantity: '', kind: 'drink' }], symptoms: ['hinchazon'] }),
    );

    const cal = await agent.get('/api/calendar?from=2026-10-01&to=2026-10-31');
    expect(cal.body.days['2026-10-02'].count).toBe(2);
    expect(cal.body.days['2026-10-02'].mealTypes).toEqual(['desayuno', 'comida']);

    const sug = await agent.get('/api/suggestions?time=08:20');
    expect(sug.body.items[0].name).toBe('Café con leche');
    expect(sug.body.meals.length).toBeGreaterThan(0);

    const foods = await agent.get('/api/foods');
    expect(foods.body.foods.find((f: { name: string }) => f.name === 'Café con leche').count).toBe(2);

    const stats = await agent.get('/api/stats?from=2026-10-01&to=2026-10-07');
    expect(stats.body.daysInRange).toBe(7);
    expect(stats.body.daysWithEntries).toBe(2);
    expect(stats.body.totalEntries).toBe(3);
    expect(stats.body.byHour[8]).toBe(2);
    expect(stats.body.topDrinks[0]).toEqual({ name: 'Café con leche', count: 2 });
    expect(stats.body.symptoms).toEqual([{ code: 'hinchazon', count: 1 }]);
    const breakfast = stats.body.mealTimes.find((m: { mealType: string }) => m.mealType === 'desayuno');
    expect(breakfast.median).toBe('08:21');
  });
});
