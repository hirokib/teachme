import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { createExploration, listExplorations, type ExplorationSpace } from './exploration-api';

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
  return <div className="mx-auto max-w-5xl space-y-10">
    <header className="max-w-3xl"><p className="mb-3 inline-flex rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">✦ Explore before you formalize</p><h1 className="text-4xl font-semibold tracking-tight">Follow an idea wherever it leads.</h1><p className="mt-3 text-muted-foreground">Start with a rough question. Branch definitions, checks, and side paths without losing where they came from.</p></header>
    <form onSubmit={create} className="pop flex gap-3 rounded-2xl bg-card p-6"><input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you exploring?" className="flex-1 rounded-md border bg-background px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"/><Button type="submit" className="pop pop-ink rounded-xl" disabled={creating}>{creating ? 'Starting…' : 'Start exploring'}</Button></form>
    <section><h2 className="mb-4 text-xl font-semibold">Recent explorations</h2>{spaces.length === 0 ? <p className="text-sm text-muted-foreground">No explorations yet.</p> : <div className="grid gap-3 md:grid-cols-2">{spaces.map((space) => <Link key={space.id} to="/explore/$spaceId" params={{ spaceId: String(space.id) }} className="pop rounded-2xl bg-card p-5"><h3 className="font-semibold">{space.title}</h3><p className="mt-3 text-xs font-medium text-primary">Open thread map →</p></Link>)}</div>}</section>
    {error && <p className="text-sm text-destructive">{error}</p>}
  </div>;
}
