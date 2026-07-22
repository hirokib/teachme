import { getDb, saveDb } from './db.js';

export type PlanInput = {
  title: string;
  goal: string;
  currentExperience: string;
  targetOutcome: string;
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
  status: string;
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
  confidence: number;
  attemptCount: number;
  misconceptions: string[];
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
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
    status: String(row.status),
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
    confidence: Number(row.confidence ?? 0),
    attemptCount: Number(row.attempt_count ?? 0),
    misconceptions: parseList(row.misconceptions_json),
    lastReviewedAt: row.last_reviewed_at ? String(row.last_reviewed_at) : null,
    nextReviewAt: row.next_review_at ? String(row.next_review_at) : null,
  };
}

const NODE_SELECT = `
  SELECT n.*, p.mastery_score, p.confidence, p.attempt_count,
    p.misconceptions_json, p.last_reviewed_at, p.next_review_at
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
        (title, goal, current_experience, target_outcome)
       VALUES (?, ?, ?, ?)`,
      [input.title, input.goal, input.currentExperience, input.targetOutcome]
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
  const assessments = rows(
    'SELECT * FROM assessments WHERE node_id = ? ORDER BY id DESC LIMIT 10',
    [nodeId]
  ).map((row) => ({
    id: Number(row.id),
    question: String(row.question),
    response: String(row.response),
    result: String(row.result),
    strengths: parseList(row.strengths_json),
    gaps: parseList(row.gaps_json),
    nextAction: String(row.next_action),
    feedback: String(row.feedback),
    confidence: Number(row.confidence),
    createdAt: String(row.created_at),
  }));
  const note = rows('SELECT content FROM node_notes WHERE node_id = ?', [nodeId])[0];
  return { node, plan: plan.plan, allNodes: plan.nodes, messages, assessments, note: String(note?.content ?? '') };
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

export type AssessmentInput = {
  question: string;
  response: string;
  result: 'not_yet' | 'partial' | 'mastered';
  strengths: string[];
  gaps: string[];
  nextAction: string;
  feedback: string;
  confidence: number;
  masteryScore: number;
};

export function saveAssessment(nodeId: number, input: AssessmentInput): void {
  const db = getDb();
  const current = getNode(nodeId);
  if (!current) throw new Error('Node not found');
  const misconceptions = Array.from(new Set([...current.misconceptions, ...input.gaps])).slice(-12);
  const days = input.result === 'mastered' ? 7 : input.result === 'partial' ? 2 : 1;
  const nextReview = new Date(Date.now() + days * 86_400_000).toISOString();
  const status = input.result === 'mastered' ? 'completed' : 'in_progress';

  db.run('BEGIN');
  try {
    db.run(
      `INSERT INTO assessments
        (node_id, question, response, result, strengths_json, gaps_json,
         next_action, feedback, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nodeId,
        input.question,
        input.response,
        input.result,
        JSON.stringify(input.strengths),
        JSON.stringify(input.gaps),
        input.nextAction,
        input.feedback,
        input.confidence,
      ]
    );
    db.run(
      `UPDATE learner_progress SET mastery_score = ?, confidence = ?,
       attempt_count = attempt_count + 1, misconceptions_json = ?,
       last_reviewed_at = CURRENT_TIMESTAMP, next_review_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE node_id = ?`,
      [input.masteryScore, input.confidence, JSON.stringify(misconceptions), nextReview, nodeId]
    );
    db.run('UPDATE learning_nodes SET status = ? WHERE id = ?', [status, nodeId]);
    db.run('COMMIT');
    saveDb();
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}
