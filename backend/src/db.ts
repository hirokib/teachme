import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'teachme.db');
let db: Database | null = null;

export async function initDb() {
  const SQL = await initSqlJs();
  const data = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  db = data ? new SQL.Database(data) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  saveDb();
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

process.on('exit', saveDb);
