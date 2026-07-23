import type { Request, Response } from 'express';
import {
  assessResponse,
  generateAssessmentQuestion,
  generateCurriculum,
  generatePrerequisiteDiagnostic,
  streamTutorReply,
  type DiagnosticAnswer,
} from './learning-ai.js';
import {
  addStudyMessage,
  createPlan,
  getNode,
  getNodeStudy,
  getPlan,
  listPlans,
  saveAssessment,
  saveNote,
} from './learning-store.js';
import { isCodexConnected } from './codex.js';
import { researchLearningGoal } from './learning-research.js';

function numericId(value: string | string[]): number | null {
  if (Array.isArray(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getPlans(_req: Request, res: Response): void {
  res.json(listPlans());
}

function planProfile(body: unknown): {
  goal: string;
  currentExperience: string;
  targetOutcome: string;
} | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const goal = typeof value.goal === 'string' ? value.goal.trim() : '';
  const currentExperience =
    typeof value.currentExperience === 'string' && value.currentExperience.trim()
      ? value.currentExperience.trim()
      : 'No background provided';
  const targetOutcome =
    typeof value.targetOutcome === 'string' && value.targetOutcome.trim()
      ? value.targetOutcome.trim()
      : `Understand and apply ${goal}`;
  return goal
    ? { goal, currentExperience, targetOutcome }
    : null;
}

export async function postPlanDiagnostic(req: Request, res: Response): Promise<void> {
  const profile = planProfile(req.body);
  if (!profile) {
    res.status(400).json({ error: 'Learning goal is required' });
    return;
  }
  if (!(await isCodexConnected())) {
    res.status(401).json({ error: 'Sign in with ChatGPT before starting the diagnostic' });
    return;
  }
  res.json(await generatePrerequisiteDiagnostic(profile));
}

export async function postPlan(req: Request, res: Response): Promise<void> {
  const body =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const profile = planProfile(body);
  if (!profile) {
    res.status(400).json({ error: 'Learning goal is required' });
    return;
  }
  const diagnostic = Array.isArray(body.diagnostic)
    ? body.diagnostic.flatMap((item): DiagnosticAnswer[] => {
        if (!item || typeof item !== 'object') return [];
        const value = item as Record<string, unknown>;
        const question = typeof value.question === 'string' ? value.question.trim() : '';
        const answer =
          typeof value.answer === 'string' ? value.answer.trim().slice(0, 5_000) : '';
        return question && answer ? [{ question, answer }] : [];
      })
    : [];
  if (diagnostic.length !== 3) {
    res.status(400).json({ error: 'Complete all three prerequisite diagnostic questions' });
    return;
  }
  if (!(await isCodexConnected())) {
    res.status(401).json({ error: 'Sign in with ChatGPT before creating a learning plan' });
    return;
  }

  const research = await researchLearningGoal(profile);
  const generated = await generateCurriculum({ ...profile, diagnostic, research });
  const result = createPlan({
    title: generated.title,
    ...profile,
    diagnosticContext: JSON.stringify(diagnostic),
    researchContext: JSON.stringify(research),
    nodes: generated.nodes,
  });
  res.status(201).json(result);
}

export function getPlanById(req: Request, res: Response): void {
  const id = numericId(req.params.id);
  const result = id ? getPlan(id) : null;
  if (!result) {
    res.status(404).json({ error: 'Learning plan not found' });
    return;
  }
  res.json(result);
}

export function getNodeById(req: Request, res: Response): void {
  const id = numericId(req.params.id);
  const result = id ? getNodeStudy(id) : null;
  if (!result) {
    res.status(404).json({ error: 'Learning node not found' });
    return;
  }
  res.json(result);
}

export async function postTutorMessage(req: Request, res: Response): Promise<void> {
  const id = numericId(req.params.id);
  const study = id ? getNodeStudy(id) : null;
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!study) {
    res.status(404).json({ error: 'Learning node not found' });
    return;
  }
  if (!message) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  const isInitialRetrieval = study.messages.length === 0;
  addStudyMessage(study.node.id, 'user', message);
  const history = [...study.messages, { role: 'user' as const, content: message }].map((item) => ({
    role: item.role,
    content: item.content,
  }));

  res.status(200);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });
  let partialReply = '';

  try {
    const reply = await streamTutorReply({
      plan: study.plan,
      node: study.node,
      allNodes: study.allNodes,
      note: study.note,
      isInitialRetrieval,
      messages: history,
      onDelta: (delta) => { partialReply += delta; res.write(delta); },
      signal: abort.signal,
      sessionId: `node-${study.node.id}`,
    });
    if (reply) addStudyMessage(study.node.id, 'assistant', reply);
    res.end();
  } catch (error) {
    if (abort.signal.aborted && partialReply) addStudyMessage(study.node.id, 'assistant', partialReply);
    if (!res.headersSent) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    } else {
      res.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export async function postAssessmentQuestion(req: Request, res: Response): Promise<void> {
  const id = numericId(req.params.id);
  const node = id ? getNode(id) : null;
  if (!node) {
    res.status(404).json({ error: 'Learning node not found' });
    return;
  }
  res.json(await generateAssessmentQuestion(node));
}

export async function postAssessment(req: Request, res: Response): Promise<void> {
  const id = numericId(req.params.id);
  const node = id ? getNode(id) : null;
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  const response = typeof req.body?.response === 'string' ? req.body.response.trim() : '';
  if (!node) {
    res.status(404).json({ error: 'Learning node not found' });
    return;
  }
  if (!question || !response) {
    res.status(400).json({ error: 'Question and response are required' });
    return;
  }
  const assessment = await assessResponse(node, question, response);
  saveAssessment(node.id, {
    result: assessment.result,
    gaps: assessment.gaps,
    masteryScore: assessment.masteryScore,
  });
  res.json({ ...assessment, progress: getNode(node.id) });
}

export function patchNodeNote(req: Request, res: Response): void {
  const id = numericId(req.params.id);
  const node = id ? getNode(id) : null;
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  if (!node) {
    res.status(404).json({ error: 'Learning node not found' });
    return;
  }
  saveNote(node.id, content.slice(0, 20_000));
  res.status(204).send();
}
