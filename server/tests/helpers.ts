import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { AppContext } from '../src/context';
import { openDatabase } from '../src/db';
import { createNoopPushService } from '../src/services/push';

export function createTestContext() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comida-amor-test-'));
  const config = loadConfig({ dataDir, clientDist: path.join(dataDir, 'no-client'), cookieSecure: false, isProd: false });
  const push = createNoopPushService();
  const ctx: AppContext = { db: openDatabase(':memory:'), config, push };
  const app = createApp(ctx);
  return {
    ctx,
    push,
    app,
    agent: () => request.agent(app),
    cleanup: () => {
      ctx.db.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export async function registerUser(agent: ReturnType<typeof request.agent>, email = 'ana@example.com', name = 'Ana') {
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'contraseña-segura', timezone: 'Europe/Madrid' });
  if (res.status !== 201) throw new Error(`registro falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.user as { id: string };
}

export const sampleEntry = (overrides: Record<string, unknown> = {}) => ({
  eatenAt: '2026-10-01T08:32',
  mealType: 'desayuno',
  items: [
    { name: 'café con leche', quantity: '1 taza', kind: 'drink' },
    { name: 'Tostadas con aceite', quantity: '2', kind: 'food' },
  ],
  notes: '',
  feelingNote: '',
  symptoms: [],
  otherSymptoms: '',
  photoIds: [],
  ...overrides,
});

// JPEG mínimo válido (1x1).
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
