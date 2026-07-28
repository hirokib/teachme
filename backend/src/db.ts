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
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS learning_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      goal TEXT NOT NULL,
      current_experience TEXT NOT NULL,
      target_outcome TEXT NOT NULL,
      diagnostic_context TEXT NOT NULL DEFAULT '',
      research_context TEXT NOT NULL DEFAULT '',
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
      attempt_count INTEGER NOT NULL DEFAULT 0,
      misconceptions_json TEXT NOT NULL DEFAULT '[]',
      last_reviewed_at TEXT,
      next_review_at TEXT,
      review_interval_days INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS node_notes (
      node_id INTEGER PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (node_id) REFERENCES learning_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_compressions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (node_id) REFERENCES learning_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exploration_spaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exploration_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id INTEGER NOT NULL,
      parent_thread_id INTEGER,
      source_message_id INTEGER,
      source_excerpt TEXT,
      title TEXT NOT NULL,
      intent TEXT NOT NULL DEFAULT 'explore' CHECK (intent IN ('explore', 'verify', 'learn')),
      context_summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (space_id) REFERENCES exploration_spaces(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_thread_id) REFERENCES exploration_threads(id) ON DELETE CASCADE,
      FOREIGN KEY (source_message_id) REFERENCES exploration_messages(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS exploration_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES exploration_threads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_verifications (
      message_id INTEGER PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
      result_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES exploration_messages(id) ON DELETE CASCADE
    );
  `);

  const planColumns = db.exec('PRAGMA table_info(learning_plans)')[0];
  if (!planColumns?.values.some((column) => column[1] === 'research_context')) {
    db.run("ALTER TABLE learning_plans ADD COLUMN research_context TEXT NOT NULL DEFAULT ''");
  }
  if (!planColumns?.values.some((column) => column[1] === 'diagnostic_context')) {
    db.run("ALTER TABLE learning_plans ADD COLUMN diagnostic_context TEXT NOT NULL DEFAULT ''");
  }
  if (planColumns?.values.some((column) => column[1] === 'time_budget_minutes')) {
    db.run('ALTER TABLE learning_plans DROP COLUMN time_budget_minutes');
  }
  if (planColumns?.values.some((column) => column[1] === 'status')) {
    db.run('ALTER TABLE learning_plans DROP COLUMN status');
  }

  const progressColumns = db.exec('PRAGMA table_info(learner_progress)')[0];
  if (progressColumns?.values.some((candidate) => candidate[1] === 'confidence')) {
    db.run('ALTER TABLE learner_progress DROP COLUMN confidence');
  }
  for (const [column, definition] of [
    ['last_reviewed_at', 'TEXT'],
    ['next_review_at', 'TEXT'],
    ['review_interval_days', 'INTEGER NOT NULL DEFAULT 0'],
  ]) {
    if (!progressColumns?.values.some((candidate) => candidate[1] === column)) {
      db.run(`ALTER TABLE learner_progress ADD COLUMN ${column} ${definition}`);
    }
  }

  const threadColumns = db.exec('PRAGMA table_info(exploration_threads)')[0];
  if (threadColumns?.values.some((column) => column[1] === 'branch_summary')) {
    db.run('ALTER TABLE exploration_threads DROP COLUMN branch_summary');
  }

  db.run('DROP TABLE IF EXISTS greetings');
  db.run('DROP TABLE IF EXISTS assessments');

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
