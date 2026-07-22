import initSqlJs, { Database } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM has no __dirname — derive it from the module URL.
const here = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(here, '..', 'teachme.db');
let db: Database | null = null;

export async function initDb() {
  const SQL = await initSqlJs();
  const data = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  db = data ? new SQL.Database(data) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS greetings (
      id INTEGER PRIMARY KEY,
      message TEXT NOT NULL
    )
  `);
  db.run(`INSERT OR IGNORE INTO greetings (id, message) VALUES (1, 'Hello World')`);

  saveDb();
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

// ponytail: full-file rewrite on every write. Fine at this size; batch or
// swap for a real driver if the db outgrows a few MB.
export function saveDb() {
  if (db) {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  }
}
