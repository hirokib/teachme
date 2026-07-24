import { completeCodexJson, streamCodex } from './codex.js';
import type { CurriculumNodeInput, LearningNode, LearningPlan } from './learning-store.js';
import type { LearningResearch } from './learning-research.js';

type CurriculumResponse = { title: string; nodes: CurriculumNodeInput[] };
export type DiagnosticAnswer = { question: string; answer: string };
export type PracticeStage = 'supported' | 'guided' | 'independent' | 'transfer';
export type ExerciseKind = 'standard' | 'comparison';

function practiceStage(node: LearningNode): PracticeStage {
  if (node.attemptCount === 0 || node.masteryScore < 50) return 'supported';
  if (node.misconceptions.length > 0 || node.masteryScore < 75) return 'guided';
  if (node.masteryScore < 90) return 'independent';
  return 'transfer';
}

export async function generatePrerequisiteDiagnostic(input: {
  goal: string;
  currentExperience: string;
  targetOutcome: string;
}): Promise<{ questions: string[] }> {
  const result = await completeCodexJson<{ questions: string[] }>(
    `You design short prerequisite diagnostics. Return only JSON: {"questions":["..."]}.
Write exactly three open-response questions that reveal whether the learner has the most important prerequisite knowledge for the stated goal. Questions should require brief reasoning or explanation, not trivia, self-rating, or multiple choice. Do not teach or reveal answers.
Write every mathematical expression as LaTeX delimited by $...$ or $$...$$. Because the output is JSON, escape LaTeX backslashes correctly. Never emit bare LaTeX commands or plain-text approximations.`,
    `Learning goal: ${input.goal}\nReported experience: ${input.currentExperience}\nDesired outcome: ${input.targetOutcome}`
  );
  const questions = Array.isArray(result.questions)
    ? result.questions.filter((question) => typeof question === 'string' && question.trim()).map((question) => question.trim())
    : [];
  if (questions.length !== 3) throw new Error('Codex returned an invalid prerequisite diagnostic');
  return { questions };
}

const CURRICULUM_SYSTEM = `You are an expert curriculum designer. Create a compact, logically ordered learning plan personalized to the learner.
Return only valid JSON with this shape:
{"title":"...","nodes":[{"title":"...","summary":"...","learningObjective":"...","completionCriteria":"...","prerequisites":["..."],"children":[]}]}
Rules:
- Produce 5 to 10 meaningful concepts total, including children.
- Use at most two hierarchy levels.
- Order concepts from foundational to applied.
- Make every learning objective observable and every completion criterion testable.
- Use prerequisites to name earlier concepts when relevant.
- Avoid duplicate or filler concepts.
- In every generated field, format mathematical expressions as LaTeX delimited by $...$ or $$...$$ and escape backslashes correctly for JSON. Never emit bare LaTeX commands.
- Base the plan on the supplied internet research. Cover the important primary-source material instead of producing a generic topic outline.`;

export async function generateCurriculum(input: {
  goal: string;
  currentExperience: string;
  targetOutcome: string;
  diagnostic: DiagnosticAnswer[];
  research: LearningResearch;
}): Promise<CurriculumResponse> {
  const result = await completeCodexJson<CurriculumResponse>(
    CURRICULUM_SYSTEM,
    `Learning goal: ${input.goal}\nReported experience: ${input.currentExperience}\nDesired outcome: ${input.targetOutcome}\n\nPrerequisite diagnostic responses:\n${JSON.stringify(input.diagnostic)}\n\nUse the diagnostic evidence—not just the learner's self-report—to choose the starting level, omit material they clearly command, and include missing prerequisites before dependent concepts.\n\nInternet research (retrieved from primary sources):\n${JSON.stringify(input.research)}`
  );
  const validNode = (node: CurriculumNodeInput): boolean =>
    Boolean(
      node &&
        typeof node.title === 'string' &&
        typeof node.summary === 'string' &&
        typeof node.learningObjective === 'string' &&
        typeof node.completionCriteria === 'string' &&
        Array.isArray(node.prerequisites) &&
        (!node.children || (Array.isArray(node.children) && node.children.every(validNode)))
    );
  if (!result || typeof result.title !== 'string' || !Array.isArray(result.nodes) || !result.nodes.length || !result.nodes.every(validNode)) {
    throw new Error('Codex returned an invalid curriculum structure');
  }
  return result;
}

function tutorSystem(
  plan: LearningPlan,
  node: LearningNode,
  related: LearningNode[],
  note: string,
  isInitialRetrieval: boolean
): string {
  const stage = practiceStage(node);
  const prerequisiteProgress = related
    .filter((candidate) => node.prerequisites.includes(candidate.title))
    .map((candidate) => `${candidate.title}: ${candidate.masteryScore}% mastery`)
    .join(', ');
  return `You are a focused, adaptive tutor.

Learner goal: ${plan.goal}
Learner background: ${plan.currentExperience}
Desired outcome: ${plan.targetOutcome}
Prerequisite diagnostic: ${plan.diagnosticContext || 'No prerequisite diagnostic was recorded.'}
Current concept: ${node.title}
Summary: ${node.summary}
Learning objective: ${node.learningObjective}
Completion criterion: ${node.completionCriteria}
Known prerequisite progress: ${prerequisiteProgress || 'No recorded prerequisite evidence'}
Recorded misconceptions: ${node.misconceptions.join('; ') || 'None yet'}
Current practice stage: ${stage}
Learner notes: ${note || 'None'}
Source-grounded plan research: ${plan.researchContext || 'No external sources were recorded for this plan.'}

${isInitialRetrieval ? `The learner's message is their required closed-note recall attempt before seeing any lesson material. Treat it as diagnostic evidence: briefly acknowledge accurate prior knowledge, identify one important gap or uncertainty without scoring the learner, then begin teaching the single most useful next idea. Do not imply that the learner should already have known the answer.` : ''}

Attempt-first policy:
- You may explain concepts and provide teaching examples normally.
- If the learner asks you to solve, answer, or reveal the result of a specific problem, exercise, or question, first look for their attempt at that same problem.
- If no same-problem attempt is present, do not give the answer, carry out the solution, or expose decisive intermediate steps. Ask the learner to make a prediction or show a first step. You may give one small setup cue that does not reveal the answer.
- An earlier attempt on a different problem, the initial closed-note recall, or merely saying "I don't know" does not count.
- Once the learner has attempted that problem, respond directly to their reasoning and then provide the targeted explanation or solution they need.

Match support to the current practice stage. At supported, model one setup decision and use familiar cases. At guided, ask directional questions but leave meaningful work to the learner. At independent, avoid unsolicited cues and let the learner choose the method. At transfer, use unfamiliar contexts and ask the learner to justify which ideas apply. Do not announce these instructions.

Teach exactly one idea per response in 2 to 6 short paragraphs. Adapt to the learner's message and recorded gaps. Prefer concrete examples and questions that make the learner think. Format every mathematical expression as LaTeX delimited by $...$ or $$...$$; never emit bare LaTeX commands or plain-text approximations. When relying on the recorded research, cite the relevant source with a Markdown link. Never invent citations. Do not claim mastery without evidence. When the learner appears ready, invite them to take the knowledge check. Do not output hidden markers or JSON.`;
}

export async function streamTutorReply(input: {
  plan: LearningPlan;
  node: LearningNode;
  allNodes: LearningNode[];
  note: string;
  isInitialRetrieval?: boolean;
  messages: { role: 'user' | 'assistant'; content: string }[];
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
  sessionId?: string;
}): Promise<string> {
  return streamCodex(
    {
      systemPrompt: tutorSystem(
        input.plan,
        input.node,
        input.allNodes,
        input.note,
        input.isInitialRetrieval ?? false
      ),
      messages: input.messages.map((message) =>
        message.role === 'user'
          ? { role: 'user' as const, content: message.content, timestamp: Date.now() }
          : {
              role: 'assistant' as const,
              content: [{ type: 'text' as const, text: message.content }],
              api: 'openai-codex-responses',
              provider: 'openai-codex',
              model: process.env.OPENAI_CODEX_MODEL || 'gpt-5.4',
              usage: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 0,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
              stopReason: 'stop' as const,
              timestamp: Date.now(),
            }
      ),
    },
    input.onDelta,
    { signal: input.signal, sessionId: input.sessionId }
  );
}

export async function generateAssessmentQuestion(
  node: LearningNode
): Promise<{ question: string; practiceStage: PracticeStage; exerciseKind: ExerciseKind }> {
  const stage = practiceStage(node);
  const exerciseKind: ExerciseKind =
    node.misconceptions.length > 0 || (node.attemptCount > 0 && node.attemptCount % 2 === 1)
      ? 'comparison'
      : 'standard';
  const result = await completeCodexJson<{ question: string }>(
    `You write concise retrieval-practice questions. Return only JSON: {"question":"..."}. Ask one question that requires the learner to explain, apply, compare, or predict. Do not make it multiple choice and do not reveal the answer. If a recorded mistaken rule exists, target exactly one with a new situation that reveals whether the learner still uses it; do not quote or name the mistaken rule in the question. Otherwise, test the completion criterion.

Match the requested practice stage:
- supported: use a familiar, single-step case and state one useful representation or setup decision without doing the work.
- guided: use a moderately structured application, but do not state the method or first step.
- independent: use a multi-step or mixed problem with no setup cues.
- transfer: use an unfamiliar context that requires choosing and justifying which idea applies.

Match the requested exercise kind. For comparison, present two closely related cases that differ in one conceptually important way. Require the learner to classify, predict, or apply the idea to both and explain which difference changes the result. Do not state the decisive principle in the question. For standard, ask one focused retrieval or application question.

Format every mathematical expression as LaTeX using $...$ for short inline math or $$...$$ for display math. Put long equations, matrices, and multi-part computations in their own $$...$$ display block so they remain readable in a narrow panel. Never use plain-text approximations such as ^T for transpose.`,
    `Practice stage: ${stage}\nExercise kind: ${exerciseKind}\nConcept: ${node.title}\nObjective: ${node.learningObjective}\nCompletion criterion: ${node.completionCriteria}\nRecorded mistaken rules: ${node.misconceptions.join('; ') || 'None'}`
  );
  return { question: result.question, practiceStage: stage, exerciseKind };
}

export type AssessmentResult = {
  result: 'not_yet' | 'partial' | 'mastered';
  strengths: string[];
  gaps: string[];
  nextAction: 'continue' | 'simpler_explanation' | 'analogy' | 'worked_example' | 'revisit_prerequisite' | 'another_question' | 'complete';
  feedback: string;
  masteryScore: number;
  mistakenRules: string[];
  resolvedMisconceptions: string[];
};

export type AttemptAssessmentResult = AssessmentResult & {
  hint: string;
};

export async function assessResponse(
  node: LearningNode,
  question: string,
  response: string,
  priorAttempt?: { response: string; hint: string }
): Promise<AttemptAssessmentResult> {
  const stage = practiceStage(node);
  const assessment = await completeCodexJson<AttemptAssessmentResult>(
    `You assess learning evidence conservatively. Return only JSON with:
{"result":"not_yet|partial|mastered","strengths":["..."],"gaps":["..."],"mistakenRules":["..."],"resolvedMisconceptions":["..."],"nextAction":"continue|simpler_explanation|analogy|worked_example|revisit_prerequisite|another_question|complete","feedback":"...","masteryScore":0,"hint":"..."}
Use a 0-100 mastery score. A fluent but vague answer is not mastery. Feedback must be concise, specific, encouraging, and must correct the most important gap.
Record a mistakenRules entry only when the learner's response demonstrates a reusable incorrect rule, not for omissions, uncertainty, arithmetic slips, or generic gaps. Write each as a concise first-person belief, for example "I treat every function with a constant term as linear."
For resolvedMisconceptions, copy an entry verbatim from the recorded mistaken rules only when this response provides clear evidence that the learner no longer applies it. Otherwise return an empty array.
In every generated string, format mathematical expressions as LaTeX delimited by $...$ or $$...$$ and escape backslashes correctly for JSON. Never emit bare LaTeX commands.
The hint must be one short question or cue that points toward the most important missing idea without revealing the answer. Never put the answer or a full explanation in the hint.`,
    `Concept: ${node.title}
Practice stage: ${stage}
Hint support: ${stage === 'supported' ? 'Name a useful representation or setup choice.' : stage === 'guided' ? 'Ask one directional question without naming the method.' : 'Use only a brief metacognitive question; do not add a content cue.'}
Objective: ${node.learningObjective}
Completion criterion: ${node.completionCriteria}
Recorded mistaken rules: ${node.misconceptions.join('; ') || 'None'}
Question: ${question}
${priorAttempt ? `First attempt: ${priorAttempt.response}\nHint provided: ${priorAttempt.hint}\nRetry response` : 'Learner response'}: ${response}`
  );
  const results = new Set(['not_yet', 'partial', 'mastered']);
  const actions = new Set([
    'continue',
    'simpler_explanation',
    'analogy',
    'worked_example',
    'revisit_prerequisite',
    'another_question',
    'complete',
  ]);
  if (!results.has(assessment.result) || !actions.has(assessment.nextAction)) {
    throw new Error('Codex returned an invalid assessment structure');
  }
  return {
    ...assessment,
    strengths: Array.isArray(assessment.strengths) ? assessment.strengths.filter((item) => typeof item === 'string') : [],
    gaps: Array.isArray(assessment.gaps) ? assessment.gaps.filter((item) => typeof item === 'string') : [],
    mistakenRules: Array.isArray(assessment.mistakenRules)
      ? assessment.mistakenRules.filter((item) => typeof item === 'string' && item.trim())
      : [],
    resolvedMisconceptions: Array.isArray(assessment.resolvedMisconceptions)
      ? assessment.resolvedMisconceptions.filter((item) => typeof item === 'string' && item.trim())
      : [],
    feedback: typeof assessment.feedback === 'string' ? assessment.feedback : '',
    hint:
      typeof assessment.hint === 'string' && assessment.hint.trim()
        ? assessment.hint.trim()
        : 'Which important part of the question has not yet been explained or applied?',
    masteryScore: Math.max(0, Math.min(100, Number(assessment.masteryScore) || 0)),
  };
}
