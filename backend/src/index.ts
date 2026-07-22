import express from 'express';
import cors from 'cors';
import { initDb, getDb } from './db';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
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

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
