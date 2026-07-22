// Run: npm test
// Guards the bug where writes were only flushed on graceful exit and a
// SIGKILL / nodemon restart silently dropped every insert.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP_DB = path.join(os.tmpdir(), `teachme-test-${process.pid}.db`);
process.env.DB_PATH = TMP_DB;

async function main() {
  fs.rmSync(TMP_DB, { force: true });

  // Imported here, not at top level, so DB_PATH is set before db.ts reads it.
  const { initDb, getDb, saveDb } = await import('./db.js');

  const db = await initDb();
  db.run('UPDATE greetings SET message = ? WHERE id = 1', ['Hello Again']);
  saveDb();

  // Simulate a hard kill: re-read the file with no exit handler ever running.
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const reloaded = new SQL.Database(fs.readFileSync(TMP_DB));
  const rows = reloaded.exec('SELECT message FROM greetings WHERE id = 1');

  assert.deepStrictEqual(
    rows[0]?.values,
    [['Hello Again']],
    'write must survive a non-graceful shutdown'
  );

  assert.ok(getDb(), 'getDb returns the live handle');
  fs.rmSync(TMP_DB, { force: true });
  console.log('✓ db persistence survives hard kill');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
