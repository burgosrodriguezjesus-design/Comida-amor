// Uso: npm run seed:demo  — regenera los datos de la cuenta de demostración.
import path from 'node:path';
import { loadConfig } from '../config';
import { openDatabase } from '../db';
import { createNoopPushService } from '../services/push';
import { ensureDemoUser } from '../services/users';
import { nowInTimeZone } from '../../../shared/dates';
import { seedDemoData } from './demo';

const config = loadConfig();
const db = openDatabase(path.join(config.dataDir, 'comida-amor.db'));
const timezone = process.env.TZ_DEMO ?? 'Europe/Madrid';
const user = await ensureDemoUser(db, timezone);
const local = nowInTimeZone(timezone);
const count = seedDemoData({ db, config, push: createNoopPushService() }, user.id, { today: local.date, now: local.time });
db.prepare('UPDATE users SET demo_seeded_on = ?, timezone = ? WHERE id = ?').run(local.date, timezone, user.id);
console.log(`Datos de demostración creados: ${count} registros para ${user.email}.`);
db.close();
