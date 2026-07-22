import type { Request, Response } from 'express';
import { streamExplorationReply } from './exploration-ai.js';
import {
  addExplorationMessage,
  createBranch,
  createSpace,
  getSpaceDetail,
  getThreadDetail,
  listSpaces,
  setThreadIntent,
  type ThreadIntent,
} from './exploration-store.js';

function id(value: string | string[]): number | null {
  if (Array.isArray(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
const intents = new Set<ThreadIntent>(['explore', 'verify', 'learn']);

export function getExplorationSpaces(_req: Request, res: Response): void {
  res.json(listSpaces());
}

export function postExplorationSpace(req: Request, res: Response): void {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }
  res.status(201).json(createSpace(title.slice(0, 160)));
}

export function getExplorationSpace(req: Request, res: Response): void {
  const spaceId = id(req.params.id);
  const result = spaceId ? getSpaceDetail(spaceId) : null;
  if (!result) {
    res.status(404).json({ error: 'Exploration space not found' });
    return;
  }
  res.json(result);
}

export function getExplorationThread(req: Request, res: Response): void {
  const threadId = id(req.params.id);
  const result = threadId ? getThreadDetail(threadId) : null;
  if (!result) {
    res.status(404).json({ error: 'Exploration thread not found' });
    return;
  }
  res.json(result);
}

export function postExplorationBranch(req: Request, res: Response): void {
  const parentThreadId = id(req.params.id);
  const sourceMessageId = Number(req.body?.sourceMessageId);
  const excerpt = typeof req.body?.excerpt === 'string' ? req.body.excerpt : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const intent = req.body?.intent as ThreadIntent;
  const contextScope = req.body?.contextScope as 'selection' | 'recent' | 'full';
  if (!parentThreadId || !Number.isInteger(sourceMessageId) || !title || !intents.has(intent)) {
    res.status(400).json({ error: 'Source message, title, and valid intent are required' });
    return;
  }
  if (!['selection', 'recent', 'full'].includes(contextScope)) {
    res.status(400).json({ error: 'Invalid context scope' });
    return;
  }
  try {
    res.status(201).json(createBranch({ parentThreadId, sourceMessageId, excerpt, title: title.slice(0, 160), intent, contextScope }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
}

export function patchExplorationIntent(req: Request, res: Response): void {
  const threadId = id(req.params.id);
  const intent = req.body?.intent as ThreadIntent;
  if (!threadId || !intents.has(intent) || !getThreadDetail(threadId)) {
    res.status(400).json({ error: 'Valid thread and intent are required' });
    return;
  }
  setThreadIntent(threadId, intent);
  res.status(204).send();
}

export async function postExplorationMessage(req: Request, res: Response): Promise<void> {
  const threadId = id(req.params.id);
  const detail = threadId ? getThreadDetail(threadId) : null;
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!detail) {
    res.status(404).json({ error: 'Exploration thread not found' });
    return;
  }
  if (!content) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }
  const userMessage = addExplorationMessage(detail.thread.id, 'user', content);
  const messages = [...detail.messages, userMessage];
  res.status(200);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  try {
    const reply = await streamExplorationReply({
      thread: detail.thread,
      messages,
      onDelta: (delta) => res.write(delta),
      signal: abort.signal,
    });
    if (reply) addExplorationMessage(detail.thread.id, 'assistant', reply);
    res.end();
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    else res.destroy(error instanceof Error ? error : new Error(String(error)));
  }
}
