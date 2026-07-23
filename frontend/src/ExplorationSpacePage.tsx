import { useEffect, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { deleteExploration, getExploration, type SpaceDetail } from './exploration-api';

export function ExplorationSpacePage() {
  const { spaceId } = useParams({ strict: false }); const [detail, setDetail] = useState<SpaceDetail | null>(null);
  useEffect(() => { void getExploration(Number(spaceId)).then(setDetail); }, [spaceId]);
  if (!detail) return <p className="text-muted-foreground">Loading exploration…</p>;
  async function remove() {
    if (!detail) return;
    if (!window.confirm(`Delete “${detail.space.title}” and all of its threads? This cannot be undone.`)) return;
    await deleteExploration(detail.space.id);
    window.location.href = '/explore';
  }
  const roots = detail.threads.filter((thread) => !thread.parentThreadId);
  const render = (parentId: number | null, depth = 0): React.ReactNode => detail.threads.filter((thread) => thread.parentThreadId === parentId).map((thread) => <div key={thread.id} style={{ marginLeft: depth * 28 }}><Link to="/explore/$spaceId/thread/$threadId" params={{ spaceId: String(detail.space.id), threadId: String(thread.id) }} className="pop mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 rounded-2xl bg-card p-4"><span className="min-w-0"><strong className="block truncate">{thread.title}</strong><span className="mt-1 block truncate text-sm text-muted-foreground">{thread.sourceExcerpt || 'Root conversation'}</span></span><span className="self-start justify-self-end whitespace-nowrap rounded-full bg-accent px-2.5 py-1 text-xs font-medium leading-none text-accent-foreground">{thread.intent}</span></Link>{render(thread.id, depth + 1)}</div>);
  return <div className="mx-auto max-w-4xl"><Link to="/explore" className="text-sm text-muted-foreground hover:underline">← Explorations</Link><div className="my-6 flex items-center justify-between gap-4"><h1 className="text-3xl font-semibold">{detail.space.title}</h1><Button type="button" variant="outline" onClick={() => void remove()} className="text-destructive hover:text-destructive">Delete exploration</Button></div>{roots.length ? render(null) : <p>No threads yet.</p>}</div>;
}
