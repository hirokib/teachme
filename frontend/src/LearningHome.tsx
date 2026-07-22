import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { createLearningPlan, listPlans, type LearningPlan } from './learning-api';

export function LearningHome() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<LearningPlan[]>([]);
  const [goal, setGoal] = useState('');
  const [experience, setExperience] = useState('');
  const [outcome, setOutcome] = useState('');
  const [minutes, setMinutes] = useState(120);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listPlans().then(setPlans).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError('');
    try {
      const created = await createLearningPlan({
        goal,
        currentExperience: experience,
        targetOutcome: outcome,
        timeBudgetMinutes: minutes,
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
        <p className="mb-2 text-sm font-medium text-muted-foreground">Adaptive learning workspace</p>
        <h1 className="text-4xl font-semibold tracking-tight">What do you want to understand?</h1>
        <p className="mt-3 text-muted-foreground">
          TeachMe creates a focused path, teaches one concept at a time, and checks what you can actually explain.
        </p>
      </section>

      <form onSubmit={submit} className="grid gap-5 rounded-xl border bg-card p-6 shadow-sm">
        <label className="grid gap-2 text-sm font-medium">
          Learning goal
          <input required value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Understand linear algebra" className="rounded-md border bg-background px-3 py-2 font-normal" />
        </label>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            What do you already know?
            <textarea required value={experience} onChange={(event) => setExperience(event.target.value)} placeholder="I know high-school algebra, but matrices are new." className="min-h-24 rounded-md border bg-background px-3 py-2 font-normal" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            What should you be able to do?
            <textarea required value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="Understand transformations and solve practical problems." className="min-h-24 rounded-md border bg-background px-3 py-2 font-normal" />
          </label>
        </div>
        <label className="grid max-w-xs gap-2 text-sm font-medium">
          Minutes available per week
          <input type="number" min={15} max={2400} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className="rounded-md border bg-background px-3 py-2 font-normal" />
        </label>
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={creating}>{creating ? 'Designing your path…' : 'Create learning plan'}</Button>
          <span className="text-sm text-muted-foreground">Requires ChatGPT sign-in</span>
        </div>
        {error && <p className="text-sm text-destructive">{error} {error.includes('Sign in') && <Link to="/chat" className="underline">Open sign-in</Link>}</p>}
      </form>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Your learning plans</h2>
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No plans yet. Create your first one above.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {plans.map((plan) => (
              <Link key={plan.id} to="/plans/$planId" params={{ planId: String(plan.id) }} className="rounded-lg border bg-card p-5 transition hover:border-foreground/30 hover:shadow-sm">
                <h3 className="font-semibold">{plan.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{plan.goal}</p>
                <p className="mt-4 text-xs text-muted-foreground">{plan.timeBudgetMinutes} minutes/week</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
