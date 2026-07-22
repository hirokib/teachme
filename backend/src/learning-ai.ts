import { completeCodexJson, streamCodex } from './codex.js';
import type { CurriculumNodeInput, LearningNode, LearningPlan } from './learning-store.js';

type CurriculumResponse = { title: string; nodes: CurriculumNodeInput[] };

const CURRICULUM_SYSTEM = `You are an expert curriculum designer. Create a compact, logically ordered learning plan personalized to the learner.
Return only valid JSON with this shape:
{"title":"...","nodes":[{"title":"...","summary":"...","learningObjective":"...","completionCriteria":"...","prerequisites":["..."],"children":[]}]}
Rules:
- Produce 5 to 10 meaningful concepts total, including children.
- Use at most two hierarchy levels.
- Order concepts from foundational to applied.
- Make every learning objective observable and every completion criterion testable.
- Use prerequisites to name earlier concepts when relevant.
- Avoid duplicate or filler concepts.`;

export async function generateCurriculum(input: {
  goal: string;
  currentExperience: string;
  targetOutcome: string;
}): Promise<CurriculumResponse> {
  const result = await completeCodexJson<CurriculumResponse>(
    CURRICULUM_SYSTEM,
    `Learning goal: ${input.goal}\nCurrent experience: ${input.currentExperience}\nDesired outcome: ${input.targetOutcome}`
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

function tutorSystem(plan: LearningPlan, node: LearningNode, related: LearningNode[], note: string): string {
  const prerequisiteProgress = related
    .filter((candidate) => node.prerequisites.includes(candidate.title))
    .map((candidate) => `${candidate.title}: ${candidate.masteryScore}% mastery`)
    .join(', ');
  return `You are a focused, adaptive tutor.

Learner goal: ${plan.goal}
Learner background: ${plan.currentExperience}
Desired outcome: ${plan.targetOutcome}
Current concept: ${node.title}
Summary: ${node.summary}
Learning objective: ${node.learningObjective}
Completion criterion: ${node.completionCriteria}
Known prerequisite progress: ${prerequisiteProgress || 'No recorded prerequisite evidence'}
Recorded misconceptions: ${node.misconceptions.join('; ') || 'None yet'}
Learner notes: ${note || 'None'}

Teach exactly one idea per response in 2 to 6 short paragraphs. Adapt to the learner's message and recorded gaps. Prefer concrete examples and questions that make the learner think. Do not claim mastery without evidence. When the learner appears ready, invite them to take the knowledge check. Do not output hidden markers or JSON.`;
}

export async function streamTutorReply(input: {
  plan: LearningPlan;
  node: LearningNode;
  allNodes: LearningNode[];
  note: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
  sessionId?: string;
}): Promise<string> {
  return streamCodex(
    {
      systemPrompt: tutorSystem(input.plan, input.node, input.allNodes, input.note),
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

export async function generateAssessmentQuestion(node: LearningNode): Promise<{ question: string }> {
  return completeCodexJson<{ question: string }>(
    `You write concise retrieval-practice questions. Return only JSON: {"question":"..."}. Ask one question that requires the learner to explain, apply, compare, or predict. Do not make it multiple choice and do not reveal the answer.`,
    `Concept: ${node.title}\nObjective: ${node.learningObjective}\nCompletion criterion: ${node.completionCriteria}\nPrior gaps: ${node.misconceptions.join('; ') || 'None'}`
  );
}

export type AssessmentResult = {
  result: 'not_yet' | 'partial' | 'mastered';
  strengths: string[];
  gaps: string[];
  nextAction: 'continue' | 'simpler_explanation' | 'analogy' | 'worked_example' | 'revisit_prerequisite' | 'another_question' | 'complete';
  feedback: string;
  masteryScore: number;
};

export async function assessResponse(
  node: LearningNode,
  question: string,
  response: string
): Promise<AssessmentResult> {
  const assessment = await completeCodexJson<AssessmentResult>(
    `You assess learning evidence conservatively. Return only JSON with:
{"result":"not_yet|partial|mastered","strengths":["..."],"gaps":["..."],"nextAction":"continue|simpler_explanation|analogy|worked_example|revisit_prerequisite|another_question|complete","feedback":"...","masteryScore":0}
Use a 0-100 mastery score. A fluent but vague answer is not mastery. Feedback must be concise, specific, encouraging, and must correct the most important gap.`,
    `Concept: ${node.title}\nObjective: ${node.learningObjective}\nCompletion criterion: ${node.completionCriteria}\nQuestion: ${question}\nLearner response: ${response}`
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
    feedback: typeof assessment.feedback === 'string' ? assessment.feedback : '',
    masteryScore: Math.max(0, Math.min(100, Number(assessment.masteryScore) || 0)),
  };
}
