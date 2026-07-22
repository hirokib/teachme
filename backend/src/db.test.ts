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

  const { createPlan, getNodeStudy, saveAssessment, saveNote } = await import(
    './learning-store.js'
  );
  const created = createPlan({
    title: 'Test plan',
    goal: 'Learn testing',
    currentExperience: 'Beginner',
    targetOutcome: 'Write a useful test',
    timeBudgetMinutes: 60,
    nodes: [
      {
        title: 'Assertions',
        summary: 'Compare actual and expected behavior.',
        learningObjective: 'Write an assertion.',
        completionCriteria: 'Explain and write one assertion.',
        prerequisites: [],
      },
    ],
  });
  const nodeId = created.nodes[0]!.id;
  saveNote(nodeId, 'Assertions encode expectations.');
  saveAssessment(nodeId, {
    question: 'What does an assertion do?',
    response: 'It compares actual behavior with an expectation.',
    result: 'mastered',
    strengths: ['Connects actual and expected behavior'],
    gaps: [],
    nextAction: 'complete',
    feedback: 'Correct and specific.',
    confidence: 80,
    masteryScore: 90,
  });
  const study = getNodeStudy(nodeId);
  assert.strictEqual(study?.note, 'Assertions encode expectations.');
  assert.strictEqual(study?.node.masteryScore, 90);
  assert.strictEqual(study?.node.status, 'completed');
  assert.strictEqual(study?.assessments.length, 1);

  const persisted = new SQL.Database(fs.readFileSync(TMP_DB));
  const planCount = persisted.exec('SELECT COUNT(*) FROM learning_plans');
  assert.deepStrictEqual(planCount[0]?.values, [[1]], 'learning plan must persist to disk');
  fs.rmSync(TMP_DB, { force: true });
  console.log('✓ db persistence and learning progress survive hard kill');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
