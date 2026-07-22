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

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
