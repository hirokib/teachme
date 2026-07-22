import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  pipeUIMessageStreamToResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { initDb, getDb } from './db.js';
import {
  codexChat,
  getCodexAuthStatus,
  logoutCodex,
  startCodexLogin,
} from './codex.js';
import {
  getNodeById,
  getPlanById,
  getPlans,
  patchNodeNote,
  postAssessment,
  postAssessmentQuestion,
  postPlan,
  postTutorMessage,
} from './learning-api.js';
import {
  getExplorationSpace,
  getExplorationSpaces,
  getExplorationThread,
  patchExplorationIntent,
  postExplorationBranch,
  postExplorationMessage,
  postExplorationSpace,
} from './exploration-api.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/hello', (_req, res) => {
  try {
    const rows = getDb().exec('SELECT message FROM greetings WHERE id = 1');
    res.json({ message: rows[0]?.values[0]?.[0] ?? 'Hello World' });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Provider lives here and nowhere else — swap `@ai-sdk/openai` for another
// @ai-sdk/* package and this is the only line that changes.
const model = openai(process.env.OPENAI_MODEL || 'gpt-4o-mini');

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body as { messages?: UIMessage[] };
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
  }

  const result = streamText({ model, messages: await convertToModelMessages(messages) });
  pipeUIMessageStreamToResponse({
    response: res,
    stream: toUIMessageStream({ stream: result.stream }),
  });
});

app.get('/api/auth/codex', getCodexAuthStatus);
app.post('/api/auth/codex/start', startCodexLogin);
app.delete('/api/auth/codex', logoutCodex);
app.post('/api/codex/chat', codexChat);

app.get('/api/plans', getPlans);
app.post('/api/plans', postPlan);
app.get('/api/plans/:id', getPlanById);
app.get('/api/nodes/:id', getNodeById);
app.post('/api/nodes/:id/tutor', postTutorMessage);
app.post('/api/nodes/:id/assessment-question', postAssessmentQuestion);
app.post('/api/nodes/:id/assessments', postAssessment);
app.patch('/api/nodes/:id/note', patchNodeNote);

app.get('/api/explorations', getExplorationSpaces);
app.post('/api/explorations', postExplorationSpace);
app.get('/api/explorations/:id', getExplorationSpace);
app.get('/api/exploration-threads/:id', getExplorationThread);
app.post('/api/exploration-threads/:id/messages', postExplorationMessage);
app.post('/api/exploration-threads/:id/branches', postExplorationBranch);
app.patch('/api/exploration-threads/:id/intent', patchExplorationIntent);

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
