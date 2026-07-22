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

  db.run(`
    CREATE TABLE IF NOT EXISTS learning_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      goal TEXT NOT NULL,
      current_experience TEXT NOT NULL,
      target_outcome TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS learning_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      parent_id INTEGER,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      learning_objective TEXT NOT NULL,
      completion_criteria TEXT NOT NULL,
      prerequisites_json TEXT NOT NULL DEFAULT '[]',
      depth INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES learning_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES learning_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS learner_progress (
      node_id INTEGER PRIMARY KEY,
      mastery_score INTEGER NOT NULL DEFAULT 0,
      confidence INTEGER NOT NULL DEFAULT 0,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      misconceptions_json TEXT NOT NULL DEFAULT '[]',
      last_reviewed_at TEXT,
      next_review_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (node_id) REFERENCES learning_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS study_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (node_id) REFERENCES learning_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL,
      question TEXT NOT NULL,
      response TEXT NOT NULL,
      result TEXT NOT NULL,
      strengths_json TEXT NOT NULL DEFAULT '[]',
      gaps_json TEXT NOT NULL DEFAULT '[]',
      next_action TEXT NOT NULL,
      feedback TEXT NOT NULL,
      confidence INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (node_id) REFERENCES learning_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS node_notes (
      node_id INTEGER PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (node_id) REFERENCES learning_nodes(id) ON DELETE CASCADE
    );
  `);

  const planColumns = db.exec('PRAGMA table_info(learning_plans)')[0];
  if (planColumns?.values.some((column) => column[1] === 'time_budget_minutes')) {
    db.run('ALTER TABLE learning_plans DROP COLUMN time_budget_minutes');
  }

  db.run('PRAGMA foreign_keys = ON');

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
