import type { Message } from '@earendil-works/pi-ai';
import { streamCodex } from './codex.js';
import type { ExplorationMessage, ExplorationThread } from './exploration-store.js';

export function explorationSystemPrompt(thread: ExplorationThread, isOpeningResponse: boolean): string {
  const branchFocus = thread.sourceExcerpt
    ? `\n\nThis thread was created from the exact selected passage below:\n<selected_passage>\n${thread.sourceExcerpt}\n</selected_passage>\nTreat this selected passage as the focal referent for the new thread. Resolve short follow-ups such as “define,” “why?”, “explain,” “is this true?”, or “compare this” against the selected passage unless the user explicitly identifies another subject.`
    : '';
  const shared = `You are helping a user explore and understand ideas in a branching conversation workspace. Be intellectually honest, distinguish facts from inference, and say when you are uncertain. Keep the current thread focused. The branch inherited this context:\n${thread.contextSummary || '(root thread; no inherited context)'}${branchFocus}`;
  if (thread.intent === 'verify') {
    return `${shared}\n\nThis is a claim-analysis thread. Identify the exact claim, explain what evidence would establish or refute it, and distinguish known assumptions from open questions. Do not claim to have verified facts or provide citations from memory. The user can run the separate live verification action on any assistant response.`;
  }
  if (thread.intent === 'learn') {
    return `${shared}\n\nThis is a learning thread. Explain one idea at a time, check the user's understanding with a concrete question, and adapt based on their response. Do not create a full curriculum unless asked.`;
  }
  const depth = isOpeningResponse
    ? `This is the opening response. Use progressive disclosure: give a useful orientation rather than a comprehensive treatment. Aim for roughly 200–350 words. Establish one clear mental model, explain three or four essential pieces with enough substance to be useful, and avoid secondary details, exhaustive lists, and long historical background.`
    : `Continue using progressive disclosure. Answer the user's chosen direction with enough detail to move their understanding forward, but do not expand into adjacent topics unless needed. Prefer roughly 250–450 words unless the user explicitly asks for a comprehensive or deeply technical answer.`;
  return `${shared}\n\nThis is an exploration thread. Help the user clarify terms, examine alternatives, surface assumptions, and discover useful follow-up questions. Avoid forcing the discussion into a lesson plan.\n\n${depth}\n\nEnd every response with 3 or 4 concise, concrete next directions using exactly this machine-readable format:\n<follow-ups>\n- First direction phrased as a user request\n- Second direction phrased as a user request\n- Third direction phrased as a user request\n</follow-ups>\nDo not put any other content inside these tags and do not refer to the tags in your answer.`;
}

function toMessages(messages: ExplorationMessage[]): Message[] {
  return messages.map((message) =>
    message.role === 'user'
      ? { role: 'user', content: message.content, timestamp: Date.now() }
      : {
          role: 'assistant', content: [{ type: 'text', text: message.content }], api: 'openai-codex-responses', provider: 'openai-codex', model: process.env.OPENAI_CODEX_MODEL || 'gpt-5.4',
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: 'stop', timestamp: Date.now(),
        }
  );
}

export function streamExplorationReply(input: { thread: ExplorationThread; messages: ExplorationMessage[]; onDelta: (delta: string) => void; signal?: AbortSignal }) {
  return streamCodex(
    { systemPrompt: explorationSystemPrompt(input.thread, input.messages.length === 1), messages: toMessages(input.messages) },
    input.onDelta,
    { signal: input.signal, sessionId: `exploration-thread-${input.thread.id}` }
  );
}
