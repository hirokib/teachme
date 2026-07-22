import { useEffect, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import {
  assessAnswer,
  generateQuestion,
  getStudyNode,
  streamTutorMessage,
  updateNote,
  type Assessment,
  type StudyDetail,
} from './learning-api';

type LocalMessage = { role: 'user' | 'assistant'; content: string };

const ACTION_LABELS: Record<string, string> = {
  continue: 'Continue learning',
  simpler_explanation: 'Explain it more simply',
  analogy: 'Give me an analogy',
  worked_example: 'Show a worked example',
  revisit_prerequisite: 'Revisit a prerequisite',
  another_question: 'Try another question',
  complete: 'Move to the next concept',
};

export function StudyPage() {
  const { nodeId } = useParams({ strict: false });
  const id = Number(nodeId);
  const [study, setStudy] = useState<StudyDetail | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [confidence, setConfidence] = useState(50);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const result = await getStudyNode(id);
    setStudy(result);
    setMessages(result.messages.map((item) => ({ role: item.role, content: item.content })));
    setNote(result.note);
  }

  useEffect(() => {
    load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [id]);

  async function sendTutor(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const history: LocalMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setMessage('');
    setBusy(true);
    setError('');
    try {
      await streamTutorMessage(id, trimmed, (reply) => {
        setMessages([...history, { role: 'assistant', content: reply }]);
      });
    } catch (cause) {
      setMessages(history);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function newQuestion() {
    setChecking(true);
    setAssessment(null);
    setAnswer('');
    setError('');
    try {
      setQuestion(await generateQuestion(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setChecking(false);
    }
  }

  async function checkAnswer(event: React.FormEvent) {
    event.preventDefault();
    if (!answer.trim()) return;
    setChecking(true);
    setError('');
    try {
      const result = await assessAnswer(id, { question, response: answer, confidence });
      setAssessment(result);
      setStudy((current) => current ? { ...current, node: result.progress } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setChecking(false);
    }
  }

  async function followRecommendation() {
    if (!assessment) return;
    if (assessment.nextAction === 'another_question') {
      await newQuestion();
      return;
    }
    if (assessment.nextAction === 'complete') {
      const next = study?.allNodes.find((candidate) => candidate.orderIndex > (study?.node.orderIndex ?? 0));
      if (next) window.location.href = `/nodes/${next.id}`;
      return;
    }
    const prompts: Record<string, string> = {
      continue: 'Continue from where we left off.',
      simpler_explanation: 'Explain the key gap more simply.',
      analogy: 'Give me an analogy that addresses my misunderstanding.',
      worked_example: 'Walk me through a worked example focused on my gap.',
      revisit_prerequisite: 'Help me revisit the prerequisite I am missing.',
    };
    await sendTutor(prompts[assessment.nextAction] || 'Help me address the gap from my assessment.');
  }

  if (!study) return <p className={error ? 'text-destructive' : 'text-muted-foreground'}>{error || 'Loading study workspace…'}</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <Link to="/plans/$planId" params={{ planId: String(study.plan.id) }} className="text-sm text-muted-foreground hover:underline">← {study.plan.title}</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-3xl font-semibold">{study.node.title}</h1><p className="mt-2 max-w-3xl text-muted-foreground">{study.node.summary}</p></div>
          <div className="rounded-lg border bg-card px-4 py-3 text-right"><span className="text-2xl font-semibold">{study.node.masteryScore}%</span><span className="block text-xs text-muted-foreground">demonstrated mastery</span></div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <div><h2 className="font-semibold">Tutor</h2><p className="text-sm text-muted-foreground">One idea at a time, adapted to your progress.</p></div>
          <div className="min-h-80 space-y-4 rounded-lg bg-muted/40 p-4">
            {messages.length === 0 && <div className="space-y-3"><p className="text-sm">Ready to start with this objective:</p><p className="font-medium">{study.node.learningObjective}</p><Button onClick={() => void sendTutor('Start teaching me this concept from the most important foundational idea.')}>Begin lesson</Button></div>}
            {messages.map((item, index) => item.role === 'user'
              ? <div key={index} className="ml-12 whitespace-pre-wrap rounded-lg bg-primary p-3 text-sm text-primary-foreground">{item.content}</div>
              : item.content
                ? <Prose key={index} className="mr-8 rounded-lg bg-background p-3 text-sm leading-relaxed">{item.content}</Prose>
                : <div key={index} className="mr-8 rounded-lg bg-background p-3 text-sm">Thinking…</div>)}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void sendTutor(message); }} className="flex gap-2"><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask for an example, go deeper, or explain your confusion…" className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" /><Button disabled={busy}>{busy ? 'Responding…' : 'Send'}</Button></form>
          <div className="flex flex-wrap gap-2">{['Continue', 'Explain simply', 'Show an example'].map((label) => <Button key={label} size="sm" variant="outline" disabled={busy} onClick={() => void sendTutor(label)}>{label}</Button>)}</div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Learning target</h2><p className="mt-2 text-sm text-muted-foreground">{study.node.learningObjective}</p><h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence of completion</h3><p className="mt-2 text-sm">{study.node.completionCriteria}</p></section>

          <section className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Knowledge check</h2>{!question && <Button size="sm" onClick={() => void newQuestion()} disabled={checking}>{checking ? 'Writing…' : 'Start check'}</Button>}</div>
            {question && !assessment && <form onSubmit={checkAnswer} className="mt-4 space-y-4"><p className="text-sm font-medium">{question}</p><textarea required value={answer} onChange={(event) => setAnswer(event.target.value)} className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Explain in your own words…" /><label className="grid gap-2 text-xs text-muted-foreground">How confident are you? {confidence}%<input type="range" min="0" max="100" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} /></label><Button disabled={checking}>{checking ? 'Assessing…' : 'Check my understanding'}</Button></form>}
            {assessment && <div className="mt-4 space-y-3"><span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium">{assessment.result.replace('_', ' ')}</span><p className="text-sm">{assessment.feedback}</p>{assessment.strengths.length > 0 && <div><p className="text-xs font-semibold text-muted-foreground">What you understand</p><ul className="mt-1 list-disc pl-5 text-sm">{assessment.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div>}{assessment.gaps.length > 0 && <div><p className="text-xs font-semibold text-muted-foreground">What to work on</p><ul className="mt-1 list-disc pl-5 text-sm">{assessment.gaps.map((item) => <li key={item}>{item}</li>)}</ul></div>}<Button onClick={() => void followRecommendation()}>{ACTION_LABELS[assessment.nextAction] || 'Continue'}</Button></div>}
          </section>

          <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Your notes</h2><textarea value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => void updateNote(id, note)} placeholder="Capture an explanation in your own words…" className="mt-3 min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm" /><p className="mt-1 text-xs text-muted-foreground">Saved when you leave the field. The tutor can use these notes.</p></section>

          {study.node.misconceptions.length > 0 && <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Active gaps</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{study.node.misconceptions.map((item) => <li key={item}>{item}</li>)}</ul></section>}
        </aside>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
