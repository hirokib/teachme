const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export type ThreadIntent = 'explore' | 'verify' | 'learn';
export type ExplorationSpace = { id: number; title: string; createdAt: string; updatedAt: string };
export type ExplorationThread = { id: number; spaceId: number; parentThreadId: number | null; sourceMessageId: number | null; sourceExcerpt: string; title: string; intent: ThreadIntent; contextSummary: string; branchSummary: string; createdAt: string; updatedAt: string };
export type ExplorationMessage = { id: number; threadId: number; role: 'user' | 'assistant'; content: string; createdAt: string };
export type SpaceDetail = { space: ExplorationSpace; threads: ExplorationThread[] };
export type ThreadDetail = { space: ExplorationSpace; thread: ExplorationThread; parent: ExplorationThread | null; sourceMessage: ExplorationMessage | null; messages: ExplorationMessage[] };

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export async function listExplorations() { return json<ExplorationSpace[]>(await fetch(`${API_URL}/api/explorations`)); }
export async function createExploration(title: string) { return json<{ space: ExplorationSpace; thread: ExplorationThread }>(await fetch(`${API_URL}/api/explorations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })); }
export async function getExploration(id: number) { return json<SpaceDetail>(await fetch(`${API_URL}/api/explorations/${id}`)); }
export async function getExplorationThread(id: number) { return json<ThreadDetail>(await fetch(`${API_URL}/api/exploration-threads/${id}`)); }
export async function createExplorationBranch(threadId: number, input: { sourceMessageId: number; excerpt: string; title: string; intent: ThreadIntent; contextScope: 'selection' | 'recent' | 'full' }) { return json<ExplorationThread>(await fetch(`${API_URL}/api/exploration-threads/${threadId}/branches`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })); }
export async function updateThreadIntent(threadId: number, intent: ThreadIntent) { const response = await fetch(`${API_URL}/api/exploration-threads/${threadId}/intent`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intent }) }); if (!response.ok) await json(response); }
export async function streamExplorationMessage(threadId: number, content: string, onDelta: (reply: string) => void) {
  const response = await fetch(`${API_URL}/api/exploration-threads/${threadId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
  if (!response.ok || !response.body) await json(response);
  const reader = response.body!.getReader(); const decoder = new TextDecoder(); let reply = '';
  while (true) { const { done, value } = await reader.read(); if (done) break; reply += decoder.decode(value, { stream: true }); onDelta(reply); }
  reply += decoder.decode(); onDelta(reply); return reply;
}
