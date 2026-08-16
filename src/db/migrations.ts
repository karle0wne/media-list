import type { DatabaseSync } from "node:sqlite";

const migrations = [
  {
    id: "0000_init",
    sql: `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('ADMIN','USER')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('ANIME','MOVIE','SERIES','BOOK')),
  title TEXT NOT NULL,
  original_title TEXT,
  country_code TEXT,
  year INTEGER,
  external_source TEXT NOT NULL CHECK(external_source IN ('ANILIST','TMDB','OPENLIBRARY')),
  external_id TEXT NOT NULL,
  external_sub_id TEXT NOT NULL DEFAULT '',
  runtime_minutes INTEGER,
  episode_count INTEGER,
  page_count INTEGER,
  cover_url TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(external_source, external_id, external_sub_id)
);
CREATE INDEX IF NOT EXISTS media_type_idx ON media(type);
CREATE TABLE IF NOT EXISTS user_media (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','IN_PROGRESS','COMPLETED','ON_HOLD','DROPPED')),
  score INTEGER CHECK(score IS NULL OR (score >= 0 AND score <= 10)),
  progress_current INTEGER NOT NULL DEFAULT 0 CHECK(progress_current >= 0),
  progress_total INTEGER CHECK(progress_total IS NULL OR progress_total >= 0),
  notes TEXT,
  time_spent_override_minutes INTEGER CHECK(time_spent_override_minutes IS NULL OR time_spent_override_minutes >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, media_id)
);
CREATE INDEX IF NOT EXISTS user_media_user_idx ON user_media(user_id);
CREATE INDEX IF NOT EXISTS user_media_status_idx ON user_media(user_id, status);
CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('QUICK','MIGRATION')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS import_batches_user_idx ON import_batches(user_id);
CREATE TABLE IF NOT EXISTS import_rows (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  raw_input TEXT NOT NULL,
  user_data_json TEXT,
  candidates_json TEXT NOT NULL DEFAULT '[]',
  selected_candidate_key TEXT,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CONFIRMED','SKIPPED','ERROR')),
  error_message TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS import_rows_batch_idx ON import_rows(batch_id);
`,
  },
] as const;

export function runMigrations(sqlite: DatabaseSync) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS app_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)`);
  const has = sqlite.prepare("SELECT 1 FROM app_migrations WHERE id = ?");
  const mark = sqlite.prepare("INSERT INTO app_migrations(id, applied_at) VALUES (?, ?)");
  for (const migration of migrations) {
    if (has.get(migration.id)) continue;
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      sqlite.exec(migration.sql);
      mark.run(migration.id, Date.now());
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}
