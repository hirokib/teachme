import type { Request, Response } from 'express';
import { assessResponse, generateAssessmentQuestion, generateCurriculum, streamTutorReply } from './learning-ai.js';
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

export async function postPlan(req: Request, res: Response): Promise<void> {
  const body = req.body as Partial<{
    goal: string;
    currentExperience: string;
    targetOutcome: string;
  }>;
  if (!body.goal?.trim() || !body.currentExperience?.trim() || !body.targetOutcome?.trim()) {
    res.status(400).json({ error: 'Goal, current experience, and target outcome are required' });
    return;
  }
  if (!(await isCodexConnected())) {
    res.status(401).json({ error: 'Sign in with ChatGPT before creating a learning plan' });
    return;
  }

  const planInput = {
    goal: body.goal.trim(),
    currentExperience: body.currentExperience.trim(),
    targetOutcome: body.targetOutcome.trim(),
  };
  const research = await researchLearningGoal(planInput);
  const generated = await generateCurriculum({ ...planInput, research });
  const result = createPlan({
    title: generated.title,
    goal: body.goal.trim(),
    currentExperience: body.currentExperience.trim(),
    targetOutcome: body.targetOutcome.trim(),
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
