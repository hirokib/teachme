import { getDb, saveDb } from './db.js';

export type PlanInput = {
  title: string;
  goal: string;
  currentExperience: string;
  targetOutcome: string;
  diagnosticContext?: string;
  researchContext?: string;
  nodes: CurriculumNodeInput[];
};

export type CurriculumNodeInput = {
  title: string;
  summary: string;
  learningObjective: string;
  completionCriteria: string;
  prerequisites: string[];
  children?: CurriculumNodeInput[];
};

export type LearningPlan = {
  id: number;
  title: string;
  goal: string;
  currentExperience: string;
  targetOutcome: string;
  diagnosticContext: string;
  researchContext: string;
  createdAt: string;
  updatedAt: string;
};

export type LearningNode = {
  id: number;
  planId: number;
  parentId: number | null;
  title: string;
  summary: string;
  learningObjective: string;
  completionCriteria: string;
  prerequisites: string[];
  depth: number;
  orderIndex: number;
  status: string;
  masteryScore: number;
  attemptCount: number;
  misconceptions: string[];
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  reviewIntervalDays: number;
};

export type SessionCompression = {
  id: number;
  content: string;
  createdAt: string;
};

type SqlValue = string | number | Uint8Array | null;

function rows(sql: string, params: SqlValue[] = []): Record<string, SqlValue>[] {
  const result = getDb().exec(sql, params);
  const first = result[0];
  if (!first) return [];
  return first.values.map((values) =>
    Object.fromEntries(first.columns.map((column, index) => [column, values[index] ?? null]))
  );
}

function parseList(value: SqlValue): string[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]')) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function mapPlan(row: Record<string, SqlValue>): LearningPlan {
  return {
    id: Number(row.id),
    title: String(row.title),
    goal: String(row.goal),
    currentExperience: String(row.current_experience),
    targetOutcome: String(row.target_outcome),
    diagnosticContext: String(row.diagnostic_context ?? ''),
    researchContext: String(row.research_context ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapNode(row: Record<string, SqlValue>): LearningNode {
  return {
    id: Number(row.id),
    planId: Number(row.plan_id),
    parentId: row.parent_id === null ? null : Number(row.parent_id),
    title: String(row.title),
    summary: String(row.summary),
    learningObjective: String(row.learning_objective),
    completionCriteria: String(row.completion_criteria),
    prerequisites: parseList(row.prerequisites_json),
    depth: Number(row.depth),
    orderIndex: Number(row.order_index),
    status: String(row.status),
    masteryScore: Number(row.mastery_score ?? 0),
    attemptCount: Number(row.attempt_count ?? 0),
    misconceptions: parseList(row.misconceptions_json),
    lastReviewedAt: row.last_reviewed_at === null ? null : String(row.last_reviewed_at),
    nextReviewAt: row.next_review_at === null ? null : String(row.next_review_at),
    reviewIntervalDays: Number(row.review_interval_days ?? 0),
  };
}

const NODE_SELECT = `
  SELECT n.*, p.mastery_score, p.attempt_count, p.misconceptions_json,
    p.last_reviewed_at, p.next_review_at, p.review_interval_days
  FROM learning_nodes n
  LEFT JOIN learner_progress p ON p.node_id = n.id
`;

export function listPlans(): LearningPlan[] {
  return rows('SELECT * FROM learning_plans ORDER BY created_at DESC').map(mapPlan);
}

export function getPlan(planId: number): { plan: LearningPlan; nodes: LearningNode[] } | null {
  const planRow = rows('SELECT * FROM learning_plans WHERE id = ?', [planId])[0];
  if (!planRow) return null;
  const nodes = rows(`${NODE_SELECT} WHERE n.plan_id = ? ORDER BY n.order_index`, [planId]).map(mapNode);
  return { plan: mapPlan(planRow), nodes };
}

export function getNode(nodeId: number): LearningNode | null {
  const row = rows(`${NODE_SELECT} WHERE n.id = ?`, [nodeId])[0];
  return row ? mapNode(row) : null;
}

export function createPlan(input: PlanInput): { plan: LearningPlan; nodes: LearningNode[] } {
  const db = getDb();
  db.run('BEGIN');
  try {
    db.run(
      `INSERT INTO learning_plans
        (title, goal, current_experience, target_outcome, diagnostic_context, research_context)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.title,
        input.goal,
        input.currentExperience,
        input.targetOutcome,
        input.diagnosticContext ?? '',
        input.researchContext ?? '',
      ]
    );
    const planId = Number(rows('SELECT last_insert_rowid() AS id')[0]?.id);
    let order = 0;
    const insertNodes = (nodes: CurriculumNodeInput[], parentId: number | null, depth: number) => {
      for (const node of nodes) {
        db.run(
          `INSERT INTO learning_nodes
            (plan_id, parent_id, title, summary, learning_objective, completion_criteria,
             prerequisites_json, depth, order_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            planId,
            parentId,
            node.title,
            node.summary,
            node.learningObjective,
            node.completionCriteria,
            JSON.stringify(node.prerequisites),
            depth,
            order++,
          ]
        );
        const nodeId = Number(rows('SELECT last_insert_rowid() AS id')[0]?.id);
        db.run('INSERT INTO learner_progress (node_id) VALUES (?)', [nodeId]);
        if (node.children?.length) insertNodes(node.children, nodeId, depth + 1);
      }
    };
    insertNodes(input.nodes, null, 0);
    db.run('COMMIT');
    saveDb();
    return getPlan(planId)!;
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

export function getNodeStudy(nodeId: number) {
  const node = getNode(nodeId);
  if (!node) return null;
  const plan = getPlan(node.planId);
  if (!plan) return null;
  const messages = rows(
    'SELECT id, role, content, created_at FROM study_messages WHERE node_id = ? ORDER BY id',
    [nodeId]
  ).map((row) => ({
    id: Number(row.id),
    role: String(row.role) as 'user' | 'assistant',
    content: String(row.content),
    createdAt: String(row.created_at),
  }));
  const note = rows('SELECT content FROM node_notes WHERE node_id = ?', [nodeId])[0];
  const compression = rows(
    `SELECT id, content, created_at FROM session_compressions
     WHERE node_id = ? ORDER BY id DESC LIMIT 1`,
    [nodeId]
  )[0];
  const latestCompression: SessionCompression | null = compression
    ? {
        id: Number(compression.id),
        content: String(compression.content),
        createdAt: String(compression.created_at),
      }
    : null;
  return {
    node,
    plan: plan.plan,
    allNodes: plan.nodes,
    messages,
    note: String(note?.content ?? ''),
    latestCompression,
  };
}

export function addStudyMessage(nodeId: number, role: 'user' | 'assistant', content: string): void {
  getDb().run('INSERT INTO study_messages (node_id, role, content) VALUES (?, ?, ?)', [nodeId, role, content]);
  saveDb();
}

export function saveNote(nodeId: number, content: string): void {
  getDb().run(
    `INSERT INTO node_notes (node_id, content) VALUES (?, ?)
     ON CONFLICT(node_id) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP`,
    [nodeId, content]
  );
  saveDb();
}

export function saveSessionCompression(nodeId: number, content: string): SessionCompression {
  getDb().run(
    'INSERT INTO session_compressions (node_id, content) VALUES (?, ?)',
    [nodeId, content]
  );
  saveDb();
  const row = rows(
    `SELECT id, content, created_at FROM session_compressions
     WHERE node_id = ? ORDER BY id DESC LIMIT 1`,
    [nodeId]
  )[0];
  if (!row) throw new Error('Session summary was not saved');
  return {
    id: Number(row.id),
    content: String(row.content),
    createdAt: String(row.created_at),
  };
}

export type AssessmentInput = {
  result: 'not_yet' | 'partial' | 'mastered';
  gaps: string[];
  mistakenRules?: string[];
  resolvedMisconceptions?: string[];
  masteryScore: number;
};

export function saveAssessment(nodeId: number, input: AssessmentInput): void {
  const db = getDb();
  const current = getNode(nodeId);
  if (!current) throw new Error('Node not found');
  const resolved = new Set(
    (input.resolvedMisconceptions ?? []).map((item) => item.trim().toLocaleLowerCase())
  );
  const retained = current.misconceptions.filter(
    (item) => !resolved.has(item.trim().toLocaleLowerCase())
  );
  const misconceptions = Array.from(
    new Set([...retained, ...(input.mistakenRules ?? []).map((item) => item.trim()).filter(Boolean)])
  ).slice(-12);
  const status = input.result === 'mastered' ? 'completed' : 'in_progress';
  const previousInterval = current.reviewIntervalDays;
  const reviewIntervalDays =
    input.result === 'not_yet'
      ? 1
      : input.result === 'partial'
        ? Math.max(2, Math.min(4, Math.ceil(previousInterval * 0.75)))
        : previousInterval < 1
          ? 3
          : Math.min(60, Math.max(previousInterval + 1, Math.round(previousInterval * 2)));
  const nextReviewAt = new Date(
    Date.now() + reviewIntervalDays * 24 * 60 * 60 * 1_000
  ).toISOString();

  db.run('BEGIN');
  try {
    db.run(
      `UPDATE learner_progress SET mastery_score = ?,
       attempt_count = attempt_count + 1, misconceptions_json = ?,
       last_reviewed_at = CURRENT_TIMESTAMP, next_review_at = ?, review_interval_days = ?,
       updated_at = CURRENT_TIMESTAMP
       WHERE node_id = ?`,
      [input.masteryScore, JSON.stringify(misconceptions), nextReviewAt, reviewIntervalDays, nodeId]
    );
    db.run('UPDATE learning_nodes SET status = ? WHERE id = ?', [status, nodeId]);
    db.run('COMMIT');
    saveDb();
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}
