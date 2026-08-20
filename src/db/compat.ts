import { DatabaseSync } from "node:sqlite";

export function applySchemaCompatibility(db: DatabaseSync) {
  if (!hasTable(db, "media") || !hasTable(db, "user_media")) return;
  addColumnIfMissing(db, "media", "romanized_title", "TEXT");
  addColumnIfMissing(db, "media", "external_url", "TEXT");
  for (const column of ["runtime_minutes", "country_code", "episode_count", "page_count", "metadata_json", "created_at"]) dropColumnIfPresent(db, "media", column);
  for (const column of ["time_spent_override_minutes", "updated_at"]) dropColumnIfPresent(db, "user_media", column);
  if (hasColumn(db, "user_media", "status") && hasColumn(db, "user_media", "progress_current") && hasColumn(db, "user_media", "progress_total")) {
    const result = db.prepare("UPDATE user_media SET progress_current = progress_total WHERE status = 'COMPLETED' AND progress_total IS NOT NULL AND progress_current != progress_total").run();
    if (result.changes) console.log(`Repaired ${result.changes} completed progress row(s).`);
  }
}

function hasTable(db: DatabaseSync, table: string) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)); }
function columns(db: DatabaseSync, table: string) { return db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>; }
function hasColumn(db: DatabaseSync, table: string, column: string) { return columns(db, table).some((item) => item.name === column); }
function addColumnIfMissing(db: DatabaseSync, table: string, column: string, definition: string) { if (!hasColumn(db, table, column)) { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); console.log(`Added ${table}.${column}.`); } }
function dropColumnIfPresent(db: DatabaseSync, table: string, column: string) { if (hasColumn(db, table, column)) { db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`); console.log(`Removed unused ${table}.${column}.`); } }
