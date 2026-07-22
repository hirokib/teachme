import { getDb, saveDb } from './db.js';

type SqlValue = string | number | Uint8Array | null;
export type ThreadIntent = 'explore' | 'verify' | 'learn';

function rows(sql: string, params: SqlValue[] = []): Record<string, SqlValue>[] {
  const result = getDb().exec(sql, params)[0];
  if (!result) return [];
  return result.values.map((values) =>
    Object.fromEntries(result.columns.map((column, index) => [column, values[index] ?? null]))
  );
}

export type ExplorationSpace = { id: number; title: string; createdAt: string; updatedAt: string };
export type ExplorationThread = {
  id: number;
  spaceId: number;
  parentThreadId: number | null;
  sourceMessageId: number | null;
  sourceExcerpt: string;
  title: string;
  intent: ThreadIntent;
  contextSummary: string;
  branchSummary: string;
  createdAt: string;
  updatedAt: string;
};
export type ExplorationMessage = {
  id: number;
  threadId: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

function mapSpace(row: Record<string, SqlValue>): ExplorationSpace {
  return { id: Number(row.id), title: String(row.title), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
function mapThread(row: Record<string, SqlValue>): ExplorationThread {
  return {
    id: Number(row.id),
    spaceId: Number(row.space_id),
    parentThreadId: row.parent_thread_id === null ? null : Number(row.parent_thread_id),
    sourceMessageId: row.source_message_id === null ? null : Number(row.source_message_id),
    sourceExcerpt: String(row.source_excerpt ?? ''),
    title: String(row.title),
    intent: String(row.intent) as ThreadIntent,
    contextSummary: String(row.context_summary ?? ''),
    branchSummary: String(row.branch_summary ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
function mapMessage(row: Record<string, SqlValue>): ExplorationMessage {
  return { id: Number(row.id), threadId: Number(row.thread_id), role: String(row.role) as 'user' | 'assistant', content: String(row.content), createdAt: String(row.created_at) };
}

export function listSpaces(): ExplorationSpace[] {
  return rows('SELECT * FROM exploration_spaces ORDER BY updated_at DESC').map(mapSpace);
}

export function createSpace(title: string): { space: ExplorationSpace; thread: ExplorationThread } {
  const db = getDb();
  db.run('BEGIN');
  try {
    db.run('INSERT INTO exploration_spaces (title) VALUES (?)', [title]);
    const spaceId = Number(rows('SELECT last_insert_rowid() AS id')[0]?.id);
    db.run("INSERT INTO exploration_threads (space_id, title, intent) VALUES (?, ?, 'explore')", [spaceId, title]);
    const threadId = Number(rows('SELECT last_insert_rowid() AS id')[0]?.id);
    db.run('COMMIT');
    saveDb();
    return { space: getSpace(spaceId)!, thread: getThread(threadId)! };
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

export function getSpace(spaceId: number): ExplorationSpace | null {
  const row = rows('SELECT * FROM exploration_spaces WHERE id = ?', [spaceId])[0];
  return row ? mapSpace(row) : null;
}

export function getSpaceDetail(spaceId: number) {
  const space = getSpace(spaceId);
  if (!space) return null;
  const threads = rows('SELECT * FROM exploration_threads WHERE space_id = ? ORDER BY id', [spaceId]).map(mapThread);
  return { space, threads };
}

export function getThread(threadId: number): ExplorationThread | null {
  const row = rows('SELECT * FROM exploration_threads WHERE id = ?', [threadId])[0];
  return row ? mapThread(row) : null;
}

export function getThreadDetail(threadId: number) {
  const thread = getThread(threadId);
  if (!thread) return null;
  const space = getSpace(thread.spaceId)!;
  const messages = rows('SELECT * FROM exploration_messages WHERE thread_id = ? ORDER BY id', [threadId]).map(mapMessage);
  const parent = thread.parentThreadId ? getThread(thread.parentThreadId) : null;
  const sourceMessage = thread.sourceMessageId
    ? rows('SELECT * FROM exploration_messages WHERE id = ?', [thread.sourceMessageId]).map(mapMessage)[0] ?? null
    : null;
  return { space, thread, parent, sourceMessage, messages };
}

export function addExplorationMessage(threadId: number, role: 'user' | 'assistant', content: string): ExplorationMessage {
  const db = getDb();
  db.run('INSERT INTO exploration_messages (thread_id, role, content) VALUES (?, ?, ?)', [threadId, role, content]);
  const id = Number(rows('SELECT last_insert_rowid() AS id')[0]?.id);
  db.run('UPDATE exploration_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [threadId]);
  const thread = getThread(threadId)!;
  db.run('UPDATE exploration_spaces SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [thread.spaceId]);
  saveDb();
  return rows('SELECT * FROM exploration_messages WHERE id = ?', [id]).map(mapMessage)[0]!;
}

export function createBranch(input: {
  parentThreadId: number;
  sourceMessageId: number;
  excerpt: string;
  title: string;
  intent: ThreadIntent;
  contextScope: 'selection' | 'recent' | 'full';
}): ExplorationThread {
  const parent = getThreadDetail(input.parentThreadId);
  if (!parent) throw new Error('Parent thread not found');
  const source = parent.messages.find((message) => message.id === input.sourceMessageId);
  if (!source) throw new Error('Source message does not belong to the parent thread');
  const excerpt = input.excerpt.trim() || source.content;
  // Browser selections come from rendered Markdown, so their text may not be a
  // byte-for-byte substring of the stored Markdown source.
  if (excerpt.length > 5000) throw new Error('Selected text is too long');
  const recent = parent.messages.slice(-6).map((message) => `${message.role}: ${message.content}`).join('\n');
  const full = parent.messages.map((message) => `${message.role}: ${message.content}`).join('\n');
  const contextSummary = input.contextScope === 'selection' ? excerpt : input.contextScope === 'recent' ? recent : full;
  getDb().run(
    `INSERT INTO exploration_threads
      (space_id, parent_thread_id, source_message_id, source_excerpt, title, intent, context_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [parent.thread.spaceId, parent.thread.id, source.id, excerpt, input.title, input.intent, contextSummary]
  );
  const id = Number(rows('SELECT last_insert_rowid() AS id')[0]?.id);
  saveDb();
  return getThread(id)!;
}

export function setThreadIntent(threadId: number, intent: ThreadIntent): void {
  getDb().run('UPDATE exploration_threads SET intent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [intent, threadId]);
  saveDb();
}
