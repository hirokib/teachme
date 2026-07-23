import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Prose } from './Prose';
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

const RESULT_STYLES: Record<string, string> = {
  mastered: 'bg-success text-success-foreground',
  partial: 'bg-warning text-warning-foreground',
  not_yet: 'bg-destructive/10 text-destructive',
};

export function StudyPage() {
  const { nodeId } = useParams({ strict: false });
  const id = Number(nodeId);
  const [study, setStudy] = useState<StudyDetail | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [message, setMessage] = useState('');
  const [initialRecall, setInitialRecall] = useState('');
  const [note, setNote] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const activeResponse = useRef<AbortController | null>(null);
  useEffect(() => () => activeResponse.current?.abort(), []);

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
    const controller = new AbortController();
    activeResponse.current = controller;
    let partialReply = '';
    try {
      await streamTutorMessage(id, trimmed, (reply) => {
        partialReply = reply;
        setMessages([...history, { role: 'assistant', content: reply }]);
      }, controller.signal);
    } catch (cause) {
      if (controller.signal.aborted) setMessages(partialReply ? [...history, { role: 'assistant', content: partialReply }] : history);
      else { setMessages(history); setError(cause instanceof Error ? cause.message : String(cause)); }
    } finally {
      if (activeResponse.current === controller) activeResponse.current = null;
      setBusy(false);
    }
  }

  function stopResponse() { activeResponse.current?.abort(); }

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
      const result = await assessAnswer(id, { question, response: answer });
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

  const awaitingInitialRecall = messages.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <Link to="/plans/$planId" params={{ planId: String(study.plan.id) }} className="text-sm text-muted-foreground hover:underline">← {study.plan.title}</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{study.node.title}</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              {awaitingInitialRecall
                ? 'Start by recalling what you know before viewing the lesson.'
                : study.node.summary}
            </p>
          </div>
          <div className={`pop rounded-2xl bg-card px-4 py-3 text-right ${study.node.masteryScore >= 70 ? 'pop-success' : study.node.masteryScore > 0 ? 'pop-warning' : ''}`}><span className={`text-2xl font-semibold ${study.node.masteryScore >= 70 ? 'text-success' : study.node.masteryScore > 0 ? 'text-warning' : 'text-muted-foreground'}`}>{study.node.masteryScore}%</span><span className="block text-xs text-muted-foreground">demonstrated mastery</span></div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
        <section className="pop space-y-4 rounded-2xl bg-card p-5">
          <div><h2 className="flex items-center gap-2 font-semibold"><span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">✦</span>{awaitingInitialRecall ? 'Closed-note recall' : 'Tutor'}</h2><p className="text-sm text-muted-foreground">{awaitingInitialRecall ? 'Retrieval comes before explanation.' : 'One idea at a time, adapted to your progress.'}</p></div>
          <div className="min-h-80 space-y-4 rounded-xl bg-muted/50 p-4">
            {awaitingInitialRecall && (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendTutor(initialRecall);
                }}
              >
                <div className="space-y-2">
                  <p className="font-medium">Before reading anything, what can you recall or infer about {study.node.title}?</p>
                  <p className="text-sm text-muted-foreground">Explain it in your own words, include any related ideas you remember, and name what feels uncertain. A rough or incomplete attempt is useful.</p>
                </div>
                <textarea
                  required
                  autoFocus
                  value={initialRecall}
                  onChange={(event) => setInitialRecall(event.target.value)}
                  placeholder="From memory, I think…"
                  className="min-h-40 w-full rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
                />
                <Button type="submit" className="pop pop-ink rounded-xl" disabled={busy || !initialRecall.trim()}>
                  {busy ? 'Reviewing recall…' : 'Submit recall and begin'}
                </Button>
              </form>
            )}
            {messages.map((item, index) => item.role === 'user'
              ? <div key={index} className="ml-12 whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary p-3 text-sm text-primary-foreground shadow-sm">{item.content}</div>
              : item.content
                ? <Prose key={index} className="mr-8 rounded-2xl rounded-bl-sm border border-primary/10 bg-card p-3 text-sm leading-relaxed shadow-sm">{item.content}</Prose>
                : <div key={index} className="mr-8 animate-pulse rounded-2xl rounded-bl-sm border border-primary/10 bg-card p-3 text-sm text-muted-foreground">Thinking…</div>)}
          </div>
          {!awaitingInitialRecall && (
            <>
              <form onSubmit={(event) => { event.preventDefault(); void sendTutor(message); }} className="flex items-end gap-2"><textarea rows={1} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendTutor(message); } }} placeholder="Ask for an example, go deeper, or explain your confusion…" className="max-h-40 min-h-10 flex-1 resize-y rounded-2xl border bg-background px-4 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30" />{busy ? <Button type="button" variant="outline" className="rounded-xl" onClick={stopResponse}><span className="size-2.5 rounded-sm bg-current"/>Stop</Button> : <Button type="submit" className="pop pop-ink rounded-xl">Send</Button>}</form>
              <div className="flex flex-wrap gap-2">{['Continue', 'Explain simply', 'Show an example'].map((label) => <Button key={label} size="sm" variant="outline" className="pop rounded-lg" disabled={busy} onClick={() => void sendTutor(label)}>{label}</Button>)}</div>
            </>
          )}
        </section>

        <aside className="space-y-5">
          {awaitingInitialRecall ? (
            <section className="pop rounded-2xl bg-accent/40 p-5">
              <h2 className="font-semibold">Lesson materials hidden</h2>
              <p className="mt-2 text-sm text-muted-foreground">The overview, learning target, knowledge check, notes, and active gaps will appear after your first recall attempt.</p>
            </section>
          ) : (
            <>
              <section className="pop rounded-2xl bg-accent/40 p-5"><h2 className="font-semibold">Learning target</h2><p className="mt-2 text-sm text-muted-foreground">{study.node.learningObjective}</p><h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence of completion</h3><p className="mt-2 text-sm">{study.node.completionCriteria}</p></section>

              <section className="pop rounded-2xl bg-card p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Knowledge check</h2>{!question && <Button type="button" size="sm" className="pop pop-ink rounded-lg" onClick={() => void newQuestion()} disabled={checking}>{checking ? 'Writing…' : 'Start check'}</Button>}</div>
                {question && !assessment && <form onSubmit={checkAnswer} className="mt-4 space-y-4"><p className="text-sm font-medium">{question}</p><textarea required value={answer} onChange={(event) => setAnswer(event.target.value)} className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Explain in your own words…" /><Button type="submit" className="pop pop-ink rounded-xl" disabled={checking}>{checking ? 'Assessing…' : 'Check my understanding'}</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</form>}
                {assessment && <div className="mt-4 space-y-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${RESULT_STYLES[assessment.result] || 'bg-muted'}`}>{assessment.result.replace('_', ' ')}</span><p className="text-sm">{assessment.feedback}</p>{assessment.strengths.length > 0 && <div><p className="text-xs font-semibold text-success">What you understand</p><ul className="mt-1 list-disc pl-5 text-sm">{assessment.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div>}{assessment.gaps.length > 0 && <div><p className="text-xs font-semibold text-warning">What to work on</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{assessment.gaps.map((item) => <li key={item}>{item}</li>)}</ul></div>}<Button className="pop pop-ink rounded-xl" onClick={() => void followRecommendation()}>{ACTION_LABELS[assessment.nextAction] || 'Continue'}</Button></div>}
              </section>

              <section className="pop rounded-2xl bg-card p-5"><h2 className="font-semibold">Your notes</h2><textarea value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => void updateNote(id, note)} placeholder="Capture an explanation in your own words…" className="mt-3 min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm" /><p className="mt-1 text-xs text-muted-foreground">Saved when you leave the field. The tutor can use these notes.</p></section>

              {study.node.misconceptions.length > 0 && <section className="pop pop-warning rounded-2xl bg-warning/10 p-5"><h2 className="font-semibold">Active gaps</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{study.node.misconceptions.map((item) => <li key={item}>{item}</li>)}</ul></section>}
            </>
          )}
        </aside>
      </div>
      {error && (!question || assessment) && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
