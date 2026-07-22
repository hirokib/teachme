import { useEffect, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { getPlan, type PlanDetail } from './learning-api';

export function PlanPage() {
  const { planId } = useParams({ strict: false });
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getPlan(Number(planId)).then(setDetail).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [planId]);

  if (error) return <p className="text-destructive">{error}</p>;
  if (!detail) return <p className="text-muted-foreground">Loading learning plan…</p>;

  const completed = detail.nodes.filter((node) => node.status === 'completed').length;
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">← All plans</Link>
        <h1 className="mt-4 text-3xl font-semibold">{detail.plan.title}</h1>
        <p className="mt-2 text-muted-foreground">{detail.plan.targetOutcome}</p>
        <div className="mt-5 flex items-center gap-3 text-sm">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${detail.nodes.length ? (completed / detail.nodes.length) * 100 : 0}%` }} /></div>
          <span>{completed}/{detail.nodes.length} mastered</span>
        </div>
      </header>

      <ol className="space-y-3">
        {detail.nodes.map((node, index) => (
          <li key={node.id} style={{ marginLeft: `${node.depth * 28}px` }}>
            <Link to="/nodes/$nodeId" params={{ nodeId: String(node.id) }} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-lg border bg-card p-4 transition hover:border-foreground/30 hover:shadow-sm">
              <span className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-medium">{index + 1}</span>
              <span>
                <span className="font-medium">{node.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{node.learningObjective}</span>
              </span>
              <span className="text-right text-sm">
                <span className="block font-medium">{node.masteryScore}%</span>
                <span className="text-xs text-muted-foreground">{node.attemptCount ? `${node.attemptCount} checks` : 'Not checked'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
