const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
};

export type PlanDetail = { plan: LearningPlan; nodes: LearningNode[] };
export type DiagnosticAnswer = { question: string; answer: string };

export type StudyDetail = {
  plan: LearningPlan;
  node: LearningNode;
  allNodes: LearningNode[];
  messages: { id: number; role: 'user' | 'assistant'; content: string; createdAt: string }[];
  note: string;
};

export type Assessment = {
  id?: number;
  question?: string;
  response?: string;
  result: 'not_yet' | 'partial' | 'mastered';
  strengths: string[];
  gaps: string[];
  nextAction: string;
  feedback: string;
  masteryScore?: number;
};

export type AssessmentAttempt =
  | {
      needsRetry: true;
      hint: string;
      result: 'not_yet' | 'partial';
      progress: LearningNode;
    }
  | ({ needsRetry: false; progress: LearningNode } & Assessment);

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function listPlans(): Promise<LearningPlan[]> {
  return json(await fetch(`${API_URL}/api/plans`));
}

export async function createLearningPlan(input: {
  goal: string;
  currentExperience: string;
  targetOutcome: string;
  diagnostic: DiagnosticAnswer[];
}): Promise<PlanDetail> {
  return json(
    await fetch(`${API_URL}/api/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  );
}

export async function generatePlanDiagnostic(input: {
  goal: string;
  currentExperience: string;
  targetOutcome: string;
}): Promise<string[]> {
  const result = await json<{ questions: string[] }>(
    await fetch(`${API_URL}/api/plans/diagnostic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  );
  return result.questions;
}

export async function getPlan(id: number): Promise<PlanDetail> {
  return json(await fetch(`${API_URL}/api/plans/${id}`));
}

export async function getStudyNode(id: number): Promise<StudyDetail> {
  return json(await fetch(`${API_URL}/api/nodes/${id}`));
}

export async function streamTutorMessage(
  nodeId: number,
  message: string,
  onDelta: (reply: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(`${API_URL}/api/nodes/${nodeId}/tutor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal,
  });
  if (!response.ok || !response.body) await json(response);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let reply = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    reply += decoder.decode(value, { stream: true });
    onDelta(reply);
  }
  reply += decoder.decode();
  onDelta(reply);
  return reply;
}

export async function generateQuestion(nodeId: number): Promise<string> {
  const result = await json<{ question: string }>(
    await fetch(`${API_URL}/api/nodes/${nodeId}/assessment-question`, { method: 'POST' })
  );
  return result.question;
}

export async function assessAnswer(
  nodeId: number,
  input: {
    question: string;
    response: string;
    phase: 'initial' | 'retry';
    initialResponse?: string;
    hint?: string;
  }
): Promise<AssessmentAttempt> {
  return json(
    await fetch(`${API_URL}/api/nodes/${nodeId}/assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  );
}

export async function updateNote(nodeId: number, content: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/nodes/${nodeId}/note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) await json(response);
}
