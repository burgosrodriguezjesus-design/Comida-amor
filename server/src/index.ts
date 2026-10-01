import path from 'node:path';
import { createApp } from './app';
import { purgeExpiredSessions } from './auth/sessions';
import { loadConfig } from './config';
import type { AppContext } from './context';
import { openDatabase } from './db';
import { purgeOrphanPhotos } from './services/photos';
import { createPushService } from './services/push';
import { purgeOldReminderLog, runReminderTick } from './services/reminders';

const config = loadConfig();
const db = openDatabase(path.join(config.dataDir, 'comida-amor.db'));
const ctx: AppContext = { db, config, push: createPushService(config) };
const app = createApp(ctx);

const server = app.listen(config.port, () => {
  console.log(`Comida Amor escuchando en http://localhost:${config.port}`);
});

// Recordatorios: se revisan cada 30 segundos.
let ticking = false;
const reminderTimer = setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    await runReminderTick(ctx);
  } catch (error) {
    console.error('[recordatorios]', error);
  } finally {
    ticking = false;
  }
}, 30_000);

// Limpieza periódica: sesiones caducadas, fotos huérfanas y registro antiguo de recordatorios.
const maintenance = () => {
  try {
    purgeExpiredSessions(db);
    purgeOrphanPhotos(db, config.dataDir);
    purgeOldReminderLog(db);
  } catch (error) {
    console.error('[mantenimiento]', error);
  }
};
maintenance();
const maintenanceTimer = setInterval(maintenance, 60 * 60_000);

function shutdown() {
  clearInterval(reminderTimer);
  clearInterval(maintenanceTimer);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
