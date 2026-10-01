import type { AppConfig } from './config';
import type { DB } from './db';
import type { PushService } from './services/push';

/** Dependencias compartidas por todas las rutas y servicios. */
export interface AppContext {
  db: DB;
  config: AppConfig;
  push: PushService;
}
