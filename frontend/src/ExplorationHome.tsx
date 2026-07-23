import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { createExploration, deleteExploration, listExplorations, type ExplorationSpace } from './exploration-api';

export function ExplorationHome() {
  const [spaces, setSpaces] = useState<ExplorationSpace[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => { listExplorations().then(setSpaces).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause))); }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault(); if (!title.trim()) return;
    setCreating(true); setError('');
    try {
      const prompt = title.trim();
      const result = await createExploration(prompt);
      window.location.href = `/explore/${result.space.id}/thread/${result.thread.id}?starter=${encodeURIComponent(prompt)}&auto=1`;
    } catch (cause) { setCreating(false); setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  async function remove(space: ExplorationSpace) {
    if (!window.confirm(`Delete “${space.title}” and all of its threads? This cannot be undone.`)) return;
    try { await deleteExploration(space.id); setSpaces((current) => current.filter((candidate) => candidate.id !== space.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <div className="mx-auto max-w-5xl space-y-10">
    <header className="max-w-3xl"><p className="mb-3 inline-flex rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">✦ Explore before you formalize</p><h1 className="text-4xl font-semibold tracking-tight">Follow an idea wherever it leads.</h1><p className="mt-3 text-muted-foreground">Start with a rough question. Branch definitions, checks, and side paths without losing where they came from.</p></header>
    <form onSubmit={create} className="pop flex gap-3 rounded-2xl bg-card p-6"><input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you exploring?" className="flex-1 rounded-md border bg-background px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"/><Button type="submit" className="pop pop-ink rounded-xl" disabled={creating}>{creating ? 'Starting…' : 'Start exploring'}</Button></form>
    <section><h2 className="mb-4 text-xl font-semibold">Recent explorations</h2>{spaces.length === 0 ? <p className="text-sm text-muted-foreground">No explorations yet.</p> : <div className="grid gap-3 md:grid-cols-2">{spaces.map((space) => <div key={space.id} className="pop group relative rounded-2xl bg-card p-5"><Link to="/explore/$spaceId" params={{ spaceId: String(space.id) }} className="block pr-16"><h3 className="font-semibold">{space.title}</h3><p className="mt-3 text-xs font-medium text-primary">Open thread map →</p></Link><button type="button" onClick={() => void remove(space)} className="absolute right-4 top-4 rounded-lg px-2 py-1 text-xs text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100">Delete</button></div>)}</div>}</section>
    {error && <p className="text-sm text-destructive">{error}</p>}
  </div>;
}
