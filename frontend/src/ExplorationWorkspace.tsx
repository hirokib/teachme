import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

type BranchDraft = { message: ExplorationMessage; excerpt: string; intent: ThreadIntent; contextScope: 'selection' | 'recent' | 'full'; continuation: string };
const INTENT_HELP: Record<ThreadIntent, string> = {
  explore: 'Clarify terms, examine alternatives, and discover questions.',
  verify: 'Identify claims and evaluate them with linked citations where possible.',
  learn: 'Explain one idea at a time and check understanding.',
};
const INTENT_LABEL: Record<ThreadIntent, string> = { explore: 'Explore', verify: 'Verify', learn: 'Learn' };
const SCOPE_LABEL: Record<BranchDraft['contextScope'], string> = { selection: 'Selection only', recent: 'Recent exchange', full: 'Full parent thread' };

function responseParts(content: string): { text: string; followUps: string[] } {
  const marker = content.indexOf('<follow-ups>');
  if (marker === -1) return { text: content, followUps: [] };
  const end = content.indexOf('</follow-ups>', marker);
  const body = end === -1 ? '' : content.slice(marker + '<follow-ups>'.length, end);
  return {
    text: content.slice(0, marker).trimEnd(),
    followUps: body.split('\n').map((line) => line.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean).slice(0, 4),
  };
}

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

  function beginBranch(message: ExplorationMessage, intent: ThreadIntent, excerpt?: string, continuation = '') {
    const selected = excerpt?.trim() || message.content;
    setBranch({ message, excerpt: selected, intent, contextScope: excerpt ? 'selection' : 'recent', continuation });
  }

  function captureSelection(message: ExplorationMessage, element: HTMLElement) {
    const selection = window.getSelection(); const excerpt = selection?.toString().trim();
    if (excerpt && selection?.anchorNode && element.contains(selection.anchorNode)) beginBranch(message, 'explore', excerpt);
  }

  async function saveBranch(event: React.FormEvent) {
    event.preventDefault(); if (!branch || !detail) return;
    try {
      const continuation = branch.continuation.trim();
      if (!continuation) return;
      const prefix = branch.intent === 'verify' ? 'Verify' : branch.intent === 'learn' ? 'Learn' : 'Explore';
      const plainTitle = continuation.replace(/[#*_`>[\]()]/g, '').replace(/\s+/g, ' ').trim();
      const title = `${prefix}: ${plainTitle.slice(0, 80)}`;
      const created = await createExplorationBranch(detail.thread.id, { sourceMessageId: branch.message.id, excerpt: branch.excerpt, title, intent: branch.intent, contextScope: branch.contextScope });
      window.location.href = `/explore/${created.spaceId}/thread/${created.id}?starter=${encodeURIComponent(continuation)}&auto=1`;
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
        {messages.map((message) => {
          if (message.role === 'user') return <div key={message.id} className="ml-auto max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground">{message.content}</div>;
          const parts = responseParts(message.content);
          const visibleMessage = { ...message, content: parts.text };
          return <article key={message.id} className="group max-w-[90%] rounded-2xl bg-muted/60 px-4 py-3 text-sm" onMouseUp={(event) => captureSelection(visibleMessage, event.currentTarget)}>
            <Prose>{parts.text || (busy ? 'Thinking…' : '')}</Prose>
            {parts.followUps.length > 0 && <div className="mt-4 flex flex-wrap gap-2" aria-label="Explore next">{parts.followUps.map((followUp) => <button key={followUp} type="button" disabled={busy} onClick={() => void sendContent(followUp, detail, messages)} className="rounded-full border bg-background px-3 py-1.5 text-left text-xs font-medium text-primary transition hover:border-primary hover:bg-accent disabled:opacity-50">{followUp}</button>)}</div>}
            {message.id > 0 && <div className="mt-3 flex gap-2 opacity-60 transition group-hover:opacity-100"><button className="text-xs font-medium text-primary" onClick={() => beginBranch(visibleMessage, 'explore')}>Branch</button><button className="text-xs font-medium text-primary" onClick={() => beginBranch(visibleMessage, 'explore', parts.text, 'Define the key terms in this passage and help me choose which one to explore.')}>Define</button><button className="text-xs font-medium text-primary" onClick={() => beginBranch(visibleMessage, 'verify', undefined, 'Verify the central claim in this passage and cite reliable sources where possible.')}>Verify</button></div>}
          </article>;
        })}
      </div>
      <form onSubmit={send} className="flex items-end gap-2 border-t pt-4"><textarea value={input} onChange={(event) => setInput(event.target.value)} rows={2} placeholder="Ask, compare, define, or challenge something…" className="max-h-40 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm field-sizing-content"/><Button type="submit" disabled={busy}>{busy ? 'Responding…' : 'Send'}</Button></form>
      {error && <p className="mt-2 text-sm text-destructive">{error} {error.includes('Sign in') && <Link to="/chat" className="underline">Sign in</Link>}</p>}
    </main>
    <aside className="space-y-4 rounded-2xl border bg-card p-4">
      <div><span id="thread-intent-label" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Thread intent</span><Select value={detail.thread.intent} onValueChange={(value) => void changeIntent(value as ThreadIntent)}><SelectTrigger aria-labelledby="thread-intent-label" className="mt-2 w-full"><SelectValue>{(value: ThreadIntent) => INTENT_LABEL[value]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(INTENT_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><p className="mt-2 text-xs text-muted-foreground">{INTENT_HELP[detail.thread.intent]}</p></div>
      {detail.parent && <div className="rounded-xl border p-3"><p className="text-xs font-semibold">Origin</p><Link to="/explore/$spaceId/thread/$threadId" params={{ spaceId: String(space.space.id), threadId: String(detail.parent.id) }} className="mt-1 block text-sm text-primary hover:underline">{detail.parent.title}</Link>{detail.thread.sourceExcerpt && <blockquote className="mt-3 border-l-2 border-primary pl-3 text-xs text-muted-foreground">{detail.thread.sourceExcerpt}</blockquote>}</div>}
      <div className="rounded-xl border p-3"><p className="text-xs font-semibold">Inherited context</p><p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">{detail.thread.contextSummary || 'This is the root thread.'}</p></div>
    </aside>
    {branch && <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4" onMouseDown={() => setBranch(null)}><form onSubmit={saveBranch} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg space-y-4 rounded-2xl bg-card p-6 shadow-xl"><div><h2 className="text-xl font-semibold">Spin out a branch</h2><p className="mt-1 text-sm text-muted-foreground">The source and inherited context stay attached automatically.</p></div><div className="relative max-h-24 overflow-hidden border-l-2 border-primary pl-4 text-sm"><Prose>{branch.excerpt}</Prose><div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent"/><span className="absolute bottom-0 right-0 bg-card pl-1 text-muted-foreground">…</span></div><label className="grid gap-2 text-sm font-medium">Where do you want to take this?<textarea autoFocus required rows={3} value={branch.continuation} onChange={(event) => setBranch({ ...branch, continuation: event.target.value })} placeholder="Ask your next question or describe what you want to examine…" className="resize-none rounded-lg border bg-background px-3 py-2 font-normal"/></label><div className="grid grid-cols-2 gap-3"><div className="grid gap-2 text-sm font-medium"><span id="branch-intent-label">Intent</span><Select value={branch.intent} onValueChange={(value) => setBranch({ ...branch, intent: value as ThreadIntent })}><SelectTrigger aria-labelledby="branch-intent-label" className="w-full font-normal"><SelectValue>{(value: ThreadIntent) => INTENT_LABEL[value]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(INTENT_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2 text-sm font-medium"><span id="branch-scope-label">Inherit</span><Select value={branch.contextScope} onValueChange={(value) => setBranch({ ...branch, contextScope: value as BranchDraft['contextScope'] })}><SelectTrigger aria-labelledby="branch-scope-label" className="w-full font-normal"><SelectValue>{(value: BranchDraft['contextScope']) => SCOPE_LABEL[value]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(SCOPE_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setBranch(null)}>Cancel</Button><Button type="submit">Create and continue</Button></div></form></div>}
  </div>;
}
