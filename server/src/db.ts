import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type DB = Database.Database;

// Migraciones en orden. Nunca modificar una ya publicada: añadir una nueva al final.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0,
    timezone TEXT NOT NULL DEFAULT 'Europe/Madrid',
    demo_seeded_on TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    user_agent TEXT
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  CREATE TABLE entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    eaten_at TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    feeling_note TEXT NOT NULL DEFAULT '',
    symptoms TEXT NOT NULL DEFAULT '[]',
    other_symptoms TEXT NOT NULL DEFAULT '',
    search_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_entries_user_time ON entries(user_id, eaten_at);

  CREATE TABLE entry_items (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    name_norm TEXT NOT NULL,
    quantity TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL CHECK (kind IN ('food', 'drink'))
  );
  CREATE INDEX idx_items_entry ON entry_items(entry_id);
  CREATE INDEX idx_items_user_name ON entry_items(user_id, name_norm);

  CREATE TABLE photos (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_id TEXT REFERENCES entries(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    mime TEXT NOT NULL,
    thumb_mime TEXT,
    width INTEGER,
    height INTEGER,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_photos_entry ON photos(entry_id);
  CREATE INDEX idx_photos_user ON photos(user_id);

  CREATE TABLE reminder_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 0,
    quiet_minutes INTEGER NOT NULL DEFAULT 60,
    times TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE reminder_log (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reminder_id TEXT NOT NULL,
    local_date TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, reminder_id, local_date)
  );

  CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_push_user ON push_subscriptions(user_id);
  `,
];

export function openDatabase(file: string): DB {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  }
  const db = new Database(file);
  if (file !== ':memory:') {
    // Solo el propietario del proceso puede leer la base de datos.
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* el sistema de archivos puede no admitir permisos */
    }
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null };
  const current = row.v ?? 0;
  for (let i = current; i < MIGRATIONS.length; i += 1) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(i + 1, new Date().toISOString());
    })();
  }
}
