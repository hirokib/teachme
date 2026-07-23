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
    );
    CREATE TABLE learner_progress (
      node_id INTEGER PRIMARY KEY,
      mastery_score INTEGER NOT NULL DEFAULT 0,
      confidence INTEGER NOT NULL DEFAULT 0,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      misconceptions_json TEXT NOT NULL DEFAULT '[]',
      last_reviewed_at TEXT,
      next_review_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE exploration_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id INTEGER NOT NULL,
      parent_thread_id INTEGER,
      source_message_id INTEGER,
      source_excerpt TEXT,
      title TEXT NOT NULL,
      intent TEXT NOT NULL DEFAULT 'explore',
      context_summary TEXT NOT NULL DEFAULT '',
      branch_summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE greetings (id INTEGER PRIMARY KEY, message TEXT NOT NULL);
    CREATE TABLE assessments (id INTEGER PRIMARY KEY, node_id INTEGER NOT NULL);
  `);
  fs.writeFileSync(TMP_DB, Buffer.from(legacy.export()));

  // Imported here, not at top level, so DB_PATH is set before db.ts reads it.
  const { initDb, getDb } = await import('./db.js');

  const db = await initDb();
  const planColumns = db.exec('PRAGMA table_info(learning_plans)')[0]?.values ?? [];
  assert.ok(
    !planColumns.some((column) => column[1] === 'time_budget_minutes'),
    'legacy time budget column must be removed'
  );
  assert.ok(
    !planColumns.some((column) => column[1] === 'status'),
    'unused legacy plan status column must be removed'
  );
  const migratedPlanColumns = db.exec('PRAGMA table_info(learning_plans)')[0]?.values ?? [];
  assert.ok(
    migratedPlanColumns.some((column) => column[1] === 'diagnostic_context'),
    'diagnostic context column must be added to existing databases'
  );
  const progressColumns = db.exec('PRAGMA table_info(learner_progress)')[0]?.values ?? [];
  assert.ok(
    !progressColumns.some((column) =>
      ['confidence', 'last_reviewed_at', 'next_review_at'].includes(String(column[1]))
    ),
    'unused learning progress columns must be removed'
  );
  const threadColumns = db.exec('PRAGMA table_info(exploration_threads)')[0]?.values ?? [];
  assert.ok(
    !threadColumns.some((column) => column[1] === 'branch_summary'),
    'unused branch summary column must be removed'
  );
  assert.deepStrictEqual(db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('greetings', 'assessments')"), []);

  assert.ok(getDb(), 'getDb returns the live handle');

  const { createPlan, getNodeStudy, saveAssessment, saveNote } = await import(
    './learning-store.js'
  );
  const created = createPlan({
    title: 'Test plan',
    goal: 'Learn testing',
    currentExperience: 'Beginner',
    targetOutcome: 'Write a useful test',
    diagnosticContext: JSON.stringify([
      { question: 'What is an assertion?', answer: 'A check against an expected result.' },
    ]),
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
    result: 'mastered',
    gaps: [],
    masteryScore: 90,
  });
  const study = getNodeStudy(nodeId);
  assert.strictEqual(study?.note, 'Assertions encode expectations.');
  assert.match(study?.plan.diagnosticContext ?? '', /expected result/);
  assert.strictEqual(study?.node.masteryScore, 90);
  assert.strictEqual(study?.node.status, 'completed');

  const {
    addExplorationMessage,
    createBranch,
    createSpace,
    deleteSpace,
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
  const { explorationSystemPrompt } = await import('./exploration-ai.js');
  const branchPrompt = explorationSystemPrompt(branchDetail!.thread, true);
  assert.match(branchPrompt, /<selected_passage>\s*reliable evidence\s*<\/selected_passage>/);
  assert.match(branchPrompt, /Resolve short follow-ups such as “define,”/);
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

  const disposable = createSpace('Disposable exploration');
  addExplorationMessage(disposable.thread.id, 'user', 'A temporary question');
  const disposableSource = addExplorationMessage(disposable.thread.id, 'assistant', 'A temporary answer');
  const disposableBranch = createBranch({
    parentThreadId: disposable.thread.id,
    sourceMessageId: disposableSource.id,
    excerpt: 'temporary answer',
    title: 'Temporary branch',
    intent: 'explore',
    contextScope: 'recent',
  });
  startMessageVerification(disposableSource.id);
  assert.ok(deleteSpace(disposable.space.id));
  assert.strictEqual(getSpaceDetail(disposable.space.id), null);
  assert.strictEqual(getThreadDetail(disposable.thread.id), null);
  assert.strictEqual(getThreadDetail(disposableBranch.id), null);
  assert.strictEqual(getMessageVerification(disposableSource.id), null);

  const { addWebSearchTool } = await import('./codex.js');
  assert.deepStrictEqual(addWebSearchTool({ tools: [{ type: 'function', name: 'existing' }] }), {
    tools: [{ type: 'function', name: 'existing' }, { type: 'web_search' }],
  });

  const { parseResearch } = await import('./learning-research.js');
  assert.deepStrictEqual(
    parseResearch({
      summary: 'Primary-source summary',
      keyTopics: ['Topic'],
      sources: [{
        title: 'Documentation',
        url: 'https://example.com/docs',
        kind: 'documentation',
        relevance: 'Defines the topic.',
      }],
    }).sources[0]?.kind,
    'documentation'
  );

  const { parseVerificationResult } = await import('./verification.js');
  const parsedVerification = parseVerificationResult({
    overallStatus: 'supported',
    summary: 'Supported by the cited source.',
    claims: [{
      claim: 'A test claim',
      verdict: 'supported',
      explanation: 'The source supports it.',
      sources: [{ title: 'Source', url: 'https://example.com/source' }],
    }],
  });
  assert.strictEqual(parsedVerification.claims[0]?.verdict, 'supported');

  const persisted = new SQL.Database(fs.readFileSync(TMP_DB));
  assert.deepStrictEqual(
    persisted.exec('SELECT content FROM node_notes WHERE node_id = ?', [nodeId])[0]?.values,
    [['Assertions encode expectations.']],
    'write must survive a non-graceful shutdown'
  );
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
