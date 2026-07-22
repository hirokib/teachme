import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Prose } from './Prose';
import {
  createExplorationBranch,
  getExploration,
  getExplorationThread,
  streamExplorationMessage,
  updateThreadIntent,
  type ExplorationMessage,
  type SpaceDetail,
  type ThreadDetail,
  type ThreadIntent,
} from './exploration-api';

type BranchDraft = { message: ExplorationMessage; excerpt: string; intent: ThreadIntent; title: string; contextScope: 'selection' | 'recent' | 'full'; starter?: string };
const INTENT_HELP: Record<ThreadIntent, string> = {
  explore: 'Clarify terms, examine alternatives, and discover questions.',
  verify: 'Identify claims and evaluate them with linked citations where possible.',
  learn: 'Explain one idea at a time and check understanding.',
};

export function ExplorationWorkspace() {
  const { spaceId, threadId } = useParams({ strict: false });
  const [space, setSpace] = useState<SpaceDetail | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [messages, setMessages] = useState<ExplorationMessage[]>([]);
  const [input, setInput] = useState(() => new URLSearchParams(window.location.search).get('starter') || '');
  const [branch, setBranch] = useState<BranchDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const autoStarted = useRef(false);

  async function load() {
    const [spaceResult, threadResult] = await Promise.all([getExploration(Number(spaceId)), getExplorationThread(Number(threadId))]);
    setSpace(spaceResult); setDetail(threadResult); setMessages(threadResult.messages);
    return threadResult;
  }
  useEffect(() => {
    void load().then((threadResult) => {
      const query = new URLSearchParams(window.location.search);
      const starter = query.get('starter')?.trim();
      if (query.get('auto') === '1' && starter && threadResult.messages.length === 0 && !autoStarted.current) {
        autoStarted.current = true;
        window.history.replaceState({}, '', window.location.pathname);
        void sendContent(starter, threadResult, []);
      }
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [spaceId, threadId]);

  async function send(event: React.FormEvent) {
    event.preventDefault(); const content = input.trim(); if (!content || busy || !detail) return;
    await sendContent(content, detail, messages);
  }

  async function sendContent(content: string, target: ThreadDetail, currentMessages: ExplorationMessage[]) {
    if (!content || busy) return;
    const optimisticUser: ExplorationMessage = { id: -Date.now(), threadId: target.thread.id, role: 'user', content, createdAt: new Date().toISOString() };
    const optimisticAssistant: ExplorationMessage = { id: optimisticUser.id - 1, threadId: target.thread.id, role: 'assistant', content: '', createdAt: new Date().toISOString() };
    const base = [...currentMessages, optimisticUser]; setMessages([...base, optimisticAssistant]); setInput(''); setBusy(true); setError('');
    try { await streamExplorationMessage(target.thread.id, content, (reply) => setMessages([...base, { ...optimisticAssistant, content: reply }])); await load(); }
    catch (cause) { setMessages(base); setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  function beginBranch(message: ExplorationMessage, intent: ThreadIntent, excerpt?: string, starter?: string) {
    const selected = excerpt?.trim() || message.content;
    const prefix = intent === 'verify' ? 'Verify' : intent === 'learn' ? 'Understand' : 'Explore';
    setBranch({ message, excerpt: selected, intent, title: `${prefix}: ${selected.slice(0, 70)}`, contextScope: excerpt ? 'selection' : 'recent', starter });
  }

  function captureSelection(message: ExplorationMessage, element: HTMLElement) {
    const selection = window.getSelection(); const excerpt = selection?.toString().trim();
    if (excerpt && selection?.anchorNode && element.contains(selection.anchorNode)) beginBranch(message, 'explore', excerpt);
  }

  async function saveBranch(event: React.FormEvent) {
    event.preventDefault(); if (!branch || !detail) return;
    try {
      const created = await createExplorationBranch(detail.thread.id, { sourceMessageId: branch.message.id, excerpt: branch.excerpt, title: branch.title, intent: branch.intent, contextScope: branch.contextScope });
      const starter = branch.starter || (branch.intent === 'verify' ? `Verify this claim and cite reliable sources where possible: ${branch.excerpt}` : branch.intent === 'learn' ? `Help me understand this one idea: ${branch.excerpt}` : `Let's explore this further: ${branch.excerpt}`);
      window.location.href = `/explore/${created.spaceId}/thread/${created.id}?starter=${encodeURIComponent(starter)}`;
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function changeIntent(intent: ThreadIntent) {
    if (!detail) return; await updateThreadIntent(detail.thread.id, intent); setDetail({ ...detail, thread: { ...detail.thread, intent } });
  }

  if (!space || !detail) return <p className={error ? 'text-destructive' : 'text-muted-foreground'}>{error || 'Loading conversation…'}</p>;
  const renderThreads = (parentId: number | null, depth = 0): React.ReactNode => space.threads.filter((thread) => thread.parentThreadId === parentId).map((thread) => <div key={thread.id}><Link to="/explore/$spaceId/thread/$threadId" params={{ spaceId: String(space.space.id), threadId: String(thread.id) }} style={{ marginLeft: depth * 12 }} className={`mb-1 block rounded-lg px-2 py-2 text-xs ${thread.id === detail.thread.id ? 'bg-accent font-semibold text-accent-foreground' : 'hover:bg-muted'}`}>{thread.title}</Link>{renderThreads(thread.id, depth + 1)}</div>);

  return <div className="mx-auto grid max-w-[1500px] gap-4 xl:grid-cols-[230px_minmax(0,1fr)_280px]">
    <aside className="rounded-2xl border bg-card p-4"><Link to="/explore/$spaceId" params={{ spaceId: String(space.space.id) }} className="text-xs text-muted-foreground hover:underline">← Thread map</Link><h2 className="my-4 text-sm font-semibold">{space.space.title}</h2>{renderThreads(null)}</aside>
    <main className="flex min-h-[72vh] min-w-0 flex-col rounded-2xl border bg-card p-5">
      <header className="border-b pb-4"><h1 className="text-xl font-semibold">{detail.thread.title}</h1><p className="mt-1 text-xs text-muted-foreground">Select text in an assistant response to branch from that exact passage.</p></header>
      <div className="flex-1 space-y-4 overflow-y-auto py-5">
        {messages.length === 0 && <div className="mx-auto max-w-xl rounded-2xl bg-accent/50 p-6 text-center"><h2 className="font-semibold">Start anywhere.</h2><p className="mt-2 text-sm text-muted-foreground">Ask a rough question, request a definition, or test an assumption. You can branch whenever another direction becomes interesting.</p></div>}
        {messages.map((message) => message.role === 'user' ? <div key={message.id} className="ml-auto max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground">{message.content}</div> : <article key={message.id} className="group max-w-[90%] rounded-2xl bg-muted/60 px-4 py-3 text-sm" onMouseUp={(event) => captureSelection(message, event.currentTarget)}><Prose>{message.content || (busy ? 'Thinking…' : '')}</Prose>{message.id > 0 && <div className="mt-3 flex gap-2 opacity-60 transition group-hover:opacity-100"><button className="text-xs font-medium text-primary" onClick={() => beginBranch(message, 'explore')}>Branch</button><button className="text-xs font-medium text-primary" onClick={() => beginBranch(message, 'explore', message.content, `Define the important terms in this response, then help me choose which one to explore:\n\n${message.content}`)}>Define</button><button className="text-xs font-medium text-primary" onClick={() => beginBranch(message, 'verify')}>Verify</button></div>}</article>)}
      </div>
      <form onSubmit={send} className="flex items-end gap-2 border-t pt-4"><textarea value={input} onChange={(event) => setInput(event.target.value)} rows={2} placeholder="Ask, compare, define, or challenge something…" className="max-h-40 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm field-sizing-content"/><Button disabled={busy}>{busy ? 'Responding…' : 'Send'}</Button></form>
      {error && <p className="mt-2 text-sm text-destructive">{error} {error.includes('Sign in') && <Link to="/chat" className="underline">Sign in</Link>}</p>}
    </main>
    <aside className="space-y-4 rounded-2xl border bg-card p-4">
      <div><label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Thread intent</label><select value={detail.thread.intent} onChange={(event) => void changeIntent(event.target.value as ThreadIntent)} className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm"><option value="explore">Explore</option><option value="verify">Verify</option><option value="learn">Learn</option></select><p className="mt-2 text-xs text-muted-foreground">{INTENT_HELP[detail.thread.intent]}</p></div>
      {detail.parent && <div className="rounded-xl border p-3"><p className="text-xs font-semibold">Origin</p><Link to="/explore/$spaceId/thread/$threadId" params={{ spaceId: String(space.space.id), threadId: String(detail.parent.id) }} className="mt-1 block text-sm text-primary hover:underline">{detail.parent.title}</Link>{detail.thread.sourceExcerpt && <blockquote className="mt-3 border-l-2 border-primary pl-3 text-xs text-muted-foreground">{detail.thread.sourceExcerpt}</blockquote>}</div>}
      <div className="rounded-xl border p-3"><p className="text-xs font-semibold">Inherited context</p><p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">{detail.thread.contextSummary || 'This is the root thread.'}</p></div>
    </aside>
    {branch && <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4" onMouseDown={() => setBranch(null)}><form onSubmit={saveBranch} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg space-y-4 rounded-2xl bg-card p-6 shadow-xl"><div><h2 className="text-xl font-semibold">Spin out a branch</h2><p className="mt-1 text-sm text-muted-foreground">The selected passage and its origin remain visible in the new thread.</p></div><blockquote className="max-h-28 overflow-y-auto border-l-2 border-primary pl-3 text-sm">{branch.excerpt}</blockquote><label className="grid gap-2 text-sm font-medium">Title<input value={branch.title} onChange={(event) => setBranch({ ...branch, title: event.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal"/></label><div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm font-medium">Intent<select value={branch.intent} onChange={(event) => setBranch({ ...branch, intent: event.target.value as ThreadIntent })} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="explore">Explore</option><option value="verify">Verify</option><option value="learn">Learn</option></select></label><label className="grid gap-2 text-sm font-medium">Inherit<select value={branch.contextScope} onChange={(event) => setBranch({ ...branch, contextScope: event.target.value as BranchDraft['contextScope'] })} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="selection">Selection only</option><option value="recent">Recent exchange</option><option value="full">Full parent thread</option></select></label></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setBranch(null)}>Cancel</Button><Button>Create branch</Button></div></form></div>}
  </div>;
}
