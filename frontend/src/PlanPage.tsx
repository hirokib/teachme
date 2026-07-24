import { useEffect, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { getPlan, type PlanDetail } from './learning-api';
import { MathText, Prose } from './Prose';

type PlanResearch = { summary?: string; sources?: { title: string; url: string; relevance?: string }[] };

function readResearch(value: string): PlanResearch | null {
  try {
    const parsed = JSON.parse(value) as PlanResearch;
    return Array.isArray(parsed.sources) ? parsed : null;
  } catch {
    return null;
  }
}

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
  const research = readResearch(detail.plan.researchContext);
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">← All plans</Link>
        <h1 className="mt-4 text-3xl font-semibold"><MathText>{detail.plan.title}</MathText></h1>
        <p className="mt-2 text-muted-foreground"><MathText>{detail.plan.targetOutcome}</MathText></p>
        <div className="mt-5 flex items-center gap-3 text-sm">
          <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-foreground bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-[width] duration-500" style={{ width: `${detail.nodes.length ? (completed / detail.nodes.length) * 100 : 0}%` }} /></div>
          <span>{completed}/{detail.nodes.length} mastered</span>
        </div>
      </header>

      {research?.sources?.length ? (
        <details className="pop rounded-2xl bg-card p-5">
          <summary className="cursor-pointer font-semibold">Sources used to create this plan ({research.sources.length})</summary>
          {research.summary && <Prose className="mt-3 text-sm text-muted-foreground">{research.summary}</Prose>}
          <ul className="mt-4 grid gap-3">
            {research.sources.map((source) => (
              <li key={source.url} className="text-sm">
                <a href={source.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{source.title} ↗</a>
                {source.relevance && <Prose className="mt-1 text-muted-foreground">{source.relevance}</Prose>}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ol className="space-y-3">
        {detail.nodes.map((node, index) => (
          <li key={node.id} style={{ marginLeft: `${node.depth * 28}px` }}>
            <Link to="/nodes/$nodeId" params={{ nodeId: String(node.id) }} className={`pop grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl bg-card p-4 ${node.status === 'completed' ? 'pop-success' : node.attemptCount ? 'pop-warning' : ''}`}>
              <span className={`flex size-8 items-center justify-center rounded-full text-sm font-medium ${node.status === 'completed' ? 'bg-success text-success-foreground' : node.attemptCount ? 'bg-warning text-warning-foreground' : 'bg-accent text-accent-foreground'}`}>{node.status === 'completed' ? '✓' : index + 1}</span>
              <span>
                <MathText className="font-medium">{node.title}</MathText>
                <MathText className="mt-1 block text-sm text-muted-foreground">{node.learningObjective}</MathText>
              </span>
              <span className="text-right text-sm">
                <span className={`block font-semibold ${node.masteryScore >= 70 ? 'text-success' : node.masteryScore > 0 ? 'text-warning' : 'text-muted-foreground'}`}>{node.masteryScore}%</span>
                <span className="text-xs text-muted-foreground">{node.attemptCount ? `${node.attemptCount} checks` : 'Not checked'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
