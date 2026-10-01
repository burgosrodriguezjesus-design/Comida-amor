import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, registerUser } from './helpers';

let t: ReturnType<typeof createTestContext>;
beforeEach(() => {
  t = createTestContext();
});
afterEach(() => t.cleanup());

describe('autenticación', () => {
  it('registra, consulta la sesión y cierra sesión', async () => {
    const agent = t.agent();
    const res = await agent
      .post('/api/auth/register')
      .send({ name: 'Ana', email: 'Ana@Example.com', password: 'contraseña-segura' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('ana@example.com');
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/ca_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe('Ana');

    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);
  });

  it('no guarda la contraseña ni el token en claro', async () => {
    const agent = t.agent();
    const res = await agent.post('/api/auth/register').send({ name: 'Ana', email: 'ana@example.com', password: 'contraseña-segura' });
    const token = /ca_sid=([^;]+)/.exec(res.headers['set-cookie'][0])![1];
    const user = t.ctx.db.prepare('SELECT password_hash FROM users').get() as { password_hash: string };
    expect(user.password_hash).toMatch(/^scrypt\$/);
    expect(user.password_hash).not.toContain('contraseña');
    const session = t.ctx.db.prepare('SELECT id FROM sessions').get() as { id: string };
    expect(session.id).not.toBe(token);
  });

  it('rechaza correos duplicados y contraseñas cortas', async () => {
    await registerUser(t.agent());
    const dup = await t.agent().post('/api/auth/register').send({ name: 'Otra', email: 'ana@example.com', password: '12345678' });
    expect(dup.status).toBe(409);
    const short = await t.agent().post('/api/auth/register').send({ name: 'Eva', email: 'eva@example.com', password: '123' });
    expect(short.status).toBe(400);
    expect(short.body.error).toMatch(/8 caracteres/);
  });

  it('inicia sesión con la contraseña correcta y da un error genérico si no', async () => {
    await registerUser(t.agent());
    const bad = await t.agent().post('/api/auth/login').send({ email: 'ana@example.com', password: 'incorrecta' });
    expect(bad.status).toBe(401);
    const unknown = await t.agent().post('/api/auth/login').send({ email: 'nadie@example.com', password: 'incorrecta' });
    expect(unknown.body.error).toBe(bad.body.error);
    const ok = await t.agent().post('/api/auth/login').send({ email: 'ANA@example.com', password: 'contraseña-segura' });
    expect(ok.status).toBe(200);
  });

  it('bloquea peticiones de otro origen', async () => {
    const res = await t
      .agent()
      .post('/api/auth/register')
      .set('Origin', 'https://malicioso.example')
      .send({ name: 'Ana', email: 'ana@example.com', password: 'contraseña-segura' });
    expect(res.status).toBe(403);
  });

  it('exige sesión para los datos', async () => {
    await t.agent().get('/api/entries').expect(401);
    await t.agent().get('/api/stats').expect(401);
  });

  it('entra en la demostración con datos de ejemplo', async () => {
    const agent = t.agent();
    const res = await agent.post('/api/auth/demo').send({ timezone: 'Europe/Madrid' });
    expect(res.status).toBe(200);
    expect(res.body.user.isDemo).toBe(true);
    const list = await agent.get('/api/entries?limit=5');
    expect(list.body.total).toBeGreaterThan(100);
    const pizza = await agent.get('/api/entries?q=pizza');
    expect(pizza.body.total).toBeGreaterThan(0);
    // La cuenta demo no admite inicio de sesión con contraseña.
    const login = await t.agent().post('/api/auth/login').send({ email: 'demo@comidaamor.app', password: 'x' });
    expect(login.status).toBe(401);
  });
});
