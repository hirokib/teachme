import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import {
  createLearningPlan,
  generatePlanDiagnostic,
  listPlans,
  type LearningPlan,
} from './learning-api';

const RESEARCH_MESSAGES = [
  'Following citation breadcrumbs…',
  'Interrogating the footnotes…',
  'Peeking under the repository floorboards…',
  'Connecting suspiciously important dots…',
  'Arranging the conceptual dominoes…',
  'Convincing the syllabus to behave…',
];

export function LearningHome() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<LearningPlan[]>([]);
  const [goal, setGoal] = useState('');
  const [experience, setExperience] = useState('');
  const [outcome, setOutcome] = useState('');
  const [diagnosticQuestions, setDiagnosticQuestions] = useState<string[]>([]);
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<string[]>([]);
  const [diagnosing, setDiagnosing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [researchMessage, setResearchMessage] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    listPlans().then(setPlans).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  useEffect(() => {
    if (!creating) {
      setResearchMessage(0);
      return;
    }
    const timer = window.setInterval(() => {
      setResearchMessage((current) => (current + 1) % RESEARCH_MESSAGES.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [creating]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (diagnosticQuestions.length === 0) {
      setDiagnosing(true);
      try {
        const questions = await generatePlanDiagnostic({
          goal,
          currentExperience: experience,
          targetOutcome: outcome,
        });
        setDiagnosticQuestions(questions);
        setDiagnosticAnswers(questions.map(() => ''));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setDiagnosing(false);
      }
      return;
    }

    setCreating(true);
    try {
      const created = await createLearningPlan({
        goal,
        currentExperience: experience,
        targetOutcome: outcome,
        diagnostic: diagnosticQuestions.map((question, index) => ({
          question,
          answer: diagnosticAnswers[index]?.trim() ?? '',
        })),
      });
      await navigate({ to: '/plans/$planId', params: { planId: String(created.plan.id) } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <section className="max-w-2xl">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">✦ Adaptive learning workspace</p>
        <h1 className="text-4xl font-semibold tracking-tight">What do you want to understand?</h1>
        <p className="mt-3 text-muted-foreground">
          TeachMe researches your topic and links, creates a source-grounded path, teaches one concept at a time, and checks what you can actually explain.
        </p>
      </section>

      <form onSubmit={submit} className="pop grid gap-5 rounded-2xl bg-card p-6">
        {diagnosticQuestions.length === 0 ? (
          <>
            <label className="grid gap-2 text-sm font-medium">
              Learning goal
              <input required value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Understand linear algebra" className="rounded-md border bg-background px-3 py-2 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/30" />
            </label>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                <span>What do you already know? <span className="font-normal text-muted-foreground">(optional)</span></span>
                <textarea value={experience} onChange={(event) => setExperience(event.target.value)} placeholder="I know high-school algebra, but matrices are new." className="min-h-24 rounded-md border bg-background px-3 py-2 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/30" />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                <span>What should you be able to do? <span className="font-normal text-muted-foreground">(optional)</span></span>
                <textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="Understand transformations and solve practical problems." className="min-h-24 rounded-md border bg-background px-3 py-2 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/30" />
              </label>
            </div>
          </>
        ) : (
          <section className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Quick prerequisite check</p>
              <h2 className="mt-1 text-xl font-semibold">Show what you already know</h2>
              <p className="mt-1 text-sm text-muted-foreground">Answer without looking anything up. “I’m not sure” is useful evidence and helps the plan start in the right place.</p>
            </div>
            {diagnosticQuestions.map((question, index) => (
              <label key={question} className="grid gap-2 text-sm font-medium">
                <span>{index + 1}. {question}</span>
                <textarea
                  required
                  maxLength={5000}
                  value={diagnosticAnswers[index] ?? ''}
                  onChange={(event) => setDiagnosticAnswers((current) =>
                    current.map((answer, answerIndex) => answerIndex === index ? event.target.value : answer)
                  )}
                  placeholder="Explain briefly in your own words…"
                  className="min-h-24 rounded-md border bg-background px-3 py-2 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
                />
              </label>
            ))}
          </section>
        )}
        <div className="flex items-center gap-4">
          {diagnosticQuestions.length > 0 && !creating && (
            <Button type="button" variant="outline" onClick={() => {
              setDiagnosticQuestions([]);
              setDiagnosticAnswers([]);
              setError('');
            }}>Edit goal</Button>
          )}
          <Button type="submit" className="pop pop-ink rounded-xl" disabled={creating || diagnosing}>
            {diagnosing ? 'Writing diagnostic…' : creating ? 'Researching and designing…' : diagnosticQuestions.length ? 'Create learning plan' : 'Continue to quick check'}
          </Button>
          <span className="text-sm text-muted-foreground">Uses live web research · Requires ChatGPT sign-in</span>
        </div>
        {creating && (
          <div role="status" aria-live="polite" className="rounded-xl bg-accent/60 p-4">
            <div className="mb-2 flex items-center justify-between gap-4 text-sm">
              <span className="font-medium">{RESEARCH_MESSAGES[researchMessage]}</span>
              <span className="shrink-0 text-xs text-muted-foreground">This can take a minute</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-background" aria-hidden="true">
              <div className="learning-plan-loader h-full w-1/3 rounded-full bg-gradient-to-r from-primary via-chart-4 to-success" />
            </div>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error} {error.includes('Sign in') && <Link to="/chat" className="underline">Open sign-in</Link>}</p>}
      </form>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Your learning plans</h2>
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No plans yet. Create your first one above.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {plans.map((plan) => (
              <Link key={plan.id} to="/plans/$planId" params={{ planId: String(plan.id) }} className="pop rounded-2xl bg-card p-5">
                <h3 className="font-semibold">{plan.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{plan.goal}</p>
                <p className="mt-4 text-xs font-medium text-primary">Open learning plan →</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
