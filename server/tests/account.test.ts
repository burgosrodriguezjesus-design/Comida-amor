import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runReminderTick } from '../src/services/reminders';
import { createTestContext, registerUser, sampleEntry, TINY_JPEG } from './helpers';

let t: ReturnType<typeof createTestContext>;
beforeEach(() => {
  t = createTestContext();
});
afterEach(() => t.cleanup());

describe('cuenta y privacidad', () => {
  it('exporta los datos en JSON', async () => {
    const agent = t.agent();
    await registerUser(agent);
    await agent.post('/api/entries').send(sampleEntry());
    const res = await agent.get('/api/account/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    const body = JSON.parse(res.text);
    expect(body.entries).toHaveLength(1);
  });

  it('borra todos los registros con contraseña', async () => {
    const agent = t.agent();
    await registerUser(agent);
    await agent.post('/api/entries').send(sampleEntry());
    await agent.post('/api/account/delete-entries').send({ password: 'mal' }).expect(403);
    await agent.post('/api/account/delete-entries').send({ password: 'contraseña-segura' }).expect(200);
    expect((await agent.get('/api/entries')).body.total).toBe(0);
  });

  it('elimina la cuenta, sus fotos y su sesión definitivamente', async () => {
    const agent = t.agent();
    const user = await registerUser(agent);
    const photo = (await agent.post('/api/photos').attach('photo', TINY_JPEG, 'f.jpg')).body.photo;
    await agent.post('/api/entries').send(sampleEntry({ photoIds: [photo.id] }));
    const uploads = path.join(t.ctx.config.dataDir, 'uploads', user.id);
    expect(fs.existsSync(uploads)).toBe(true);

    await agent.post('/api/account/delete').send({ password: 'contraseña-segura' }).expect(200);
    expect(fs.existsSync(uploads)).toBe(false);
    for (const table of ['users', 'entries', 'entry_items', 'photos', 'sessions']) {
      const row = t.ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
      expect(row.n, table).toBe(0);
    }
    await agent.get('/api/auth/me').expect(401);
  });

  it('cambia la contraseña y cierra las demás sesiones', async () => {
    const a = t.agent();
    await registerUser(a);
    const b = t.agent();
    await b.post('/api/auth/login').send({ email: 'ana@example.com', password: 'contraseña-segura' }).expect(200);
    await a.post('/api/account/password').send({ currentPassword: 'contraseña-segura', newPassword: 'otra-contraseña' }).expect(200);
    await a.get('/api/auth/me').expect(200);
    await b.get('/api/auth/me').expect(401);
  });
});

describe('recordatorios', () => {
  it('guarda la configuración y envía el recordatorio una sola vez', async () => {
    const agent = t.agent();
    const user = await registerUser(agent);
    const settings = await agent.get('/api/reminders');
    expect(settings.body.enabled).toBe(false);
    expect(settings.body.times.length).toBeGreaterThan(0);

    await agent
      .put('/api/reminders')
      .send({ enabled: true, quietMinutes: 60, times: [{ id: 'r1', time: '10:00', enabled: true }] })
      .expect(200);
    await agent
      .post('/api/push/subscribe')
      .send({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p256dh-key-123', auth: 'auth-key-1' } })
      .expect(200);

    // 10:05 en Madrid (UTC+2 en octubre) = 08:05 UTC
    const at = new Date('2026-10-01T08:05:00Z');
    t.ctx.db.prepare('UPDATE users SET timezone = ? WHERE id = ?').run('Europe/Madrid', user.id);
    await runReminderTick(t.ctx, at);
    await runReminderTick(t.ctx, new Date('2026-10-01T08:06:00Z'));
    expect(t.push.sent).toHaveLength(1);
    expect(t.push.sent[0].payload.body).toBe('¿Has registrado lo que acabas de comer?');
  });

  it('no molesta si acaba de registrar algo', async () => {
    const agent = t.agent();
    await registerUser(agent);
    await agent.put('/api/reminders').send({ enabled: true, quietMinutes: 60, times: [{ id: 'r1', time: '15:00', enabled: true }] });
    await agent.post('/api/push/subscribe').send({ endpoint: 'https://push.example.com/x', keys: { p256dh: 'p256dh-key-123', auth: 'auth-key-1' } });
    await agent.post('/api/entries').send(sampleEntry({ eatenAt: '2026-10-01T14:40', mealType: 'comida' }));
    await runReminderTick(t.ctx, new Date('2026-10-01T13:02:00Z')); // 15:02 en Madrid
    expect(t.push.sent).toHaveLength(0);
  });
});
