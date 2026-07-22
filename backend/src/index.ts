import express from 'express';
import cors from 'cors';
import { initDb, getDb } from './db';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/topics', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  try {
    const db = getDb();
    db.run('INSERT INTO topics (name) VALUES (?)', [name]);
    const result = db.exec('SELECT last_insert_rowid() as id');
    res.json({ id: result[0]?.values[0]?.[0] || null, name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/topics', (req, res) => {
  try {
    const db = getDb();
    const result = db.exec('SELECT id, name FROM topics');
    const topics = result[0]?.values.map(([id, name]) => ({ id, name })) || [];
    res.json(topics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
