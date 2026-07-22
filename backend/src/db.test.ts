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
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const legacy = new SQL.Database();
  legacy.run(`
    CREATE TABLE learning_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      goal TEXT NOT NULL,
      current_experience TEXT NOT NULL,
      target_outcome TEXT NOT NULL,
      time_budget_minutes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  fs.writeFileSync(TMP_DB, Buffer.from(legacy.export()));

  // Imported here, not at top level, so DB_PATH is set before db.ts reads it.
  const { initDb, getDb, saveDb } = await import('./db.js');

  const db = await initDb();
  const planColumns = db.exec('PRAGMA table_info(learning_plans)')[0]?.values ?? [];
  assert.ok(
    !planColumns.some((column) => column[1] === 'time_budget_minutes'),
    'legacy time budget column must be removed'
  );
  db.run('UPDATE greetings SET message = ? WHERE id = 1', ['Hello Again']);
  saveDb();

  // Simulate a hard kill: re-read the file with no exit handler ever running.
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

  const {
    addExplorationMessage,
    createBranch,
    createSpace,
    getSpaceDetail,
    getThreadDetail,
    finishMessageVerification,
    getMessageVerification,
    setThreadIntent,
    startMessageVerification,
  } = await import('./exploration-store.js');
  const exploration = createSpace('Why do models hallucinate?');
  addExplorationMessage(exploration.thread.id, 'user', 'What does hallucination mean?');
  const source = addExplorationMessage(
    exploration.thread.id,
    'assistant',
    'A hallucination is a confident response not grounded in reliable evidence.'
  );
  const branch = createBranch({
    parentThreadId: exploration.thread.id,
    sourceMessageId: source.id,
    excerpt: 'reliable evidence',
    title: 'Verify: reliable evidence',
    intent: 'verify',
    contextScope: 'recent',
  });
  setThreadIntent(branch.id, 'learn');
  const branchDetail = getThreadDetail(branch.id);
  assert.strictEqual(branchDetail?.thread.parentThreadId, exploration.thread.id);
  assert.strictEqual(branchDetail?.thread.sourceMessageId, source.id);
  assert.strictEqual(branchDetail?.thread.sourceExcerpt, 'reliable evidence');
  assert.strictEqual(branchDetail?.thread.intent, 'learn');
  assert.match(branchDetail?.thread.contextSummary ?? '', /hallucination mean/);
  assert.strictEqual(getSpaceDetail(exploration.space.id)?.threads.length, 2);
  startMessageVerification(source.id);
  finishMessageVerification(source.id, {
    overallStatus: 'mostly_supported',
    summary: 'The central definition is broadly consistent with the source.',
    claims: [{
      claim: 'Hallucinations are not grounded in reliable evidence.',
      verdict: 'supported',
      explanation: 'The source describes this lack of grounding.',
      sources: [{ title: 'Primary source', url: 'https://example.com/source' }],
    }],
  });
  assert.strictEqual(getMessageVerification(source.id)?.result?.claims[0]?.sources[0]?.url, 'https://example.com/source');

  const persisted = new SQL.Database(fs.readFileSync(TMP_DB));
  const planCount = persisted.exec('SELECT COUNT(*) FROM learning_plans');
  assert.deepStrictEqual(planCount[0]?.values, [[1]], 'learning plan must persist to disk');
  const explorationCount = persisted.exec('SELECT COUNT(*) FROM exploration_threads');
  assert.deepStrictEqual(explorationCount[0]?.values, [[2]], 'exploration branches must persist to disk');
  const verificationCount = persisted.exec("SELECT COUNT(*) FROM message_verifications WHERE status = 'completed'");
  assert.deepStrictEqual(verificationCount[0]?.values, [[1]], 'message verification must persist to disk');
  fs.rmSync(TMP_DB, { force: true });
  console.log('✓ database, learning progress, and exploration branches persist');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
