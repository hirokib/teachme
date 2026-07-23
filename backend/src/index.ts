import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
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
  postPlanDiagnostic,
  postTutorMessage,
} from './learning-api.js';
import {
  deleteExplorationSpace,
  getExplorationSpace,
  getExplorationSpaces,
  getExplorationThread,
  patchExplorationIntent,
  postExplorationBranch,
  postExplorationMessage,
  postExplorationSpace,
  postMessageVerification,
} from './exploration-api.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/auth/codex', getCodexAuthStatus);
app.post('/api/auth/codex/start', startCodexLogin);
app.delete('/api/auth/codex', logoutCodex);
app.post('/api/codex/chat', codexChat);

app.get('/api/plans', getPlans);
app.post('/api/plans/diagnostic', postPlanDiagnostic);
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
app.delete('/api/explorations/:id', deleteExplorationSpace);

app.get('/api/exploration-threads/:id', getExplorationThread);
app.post('/api/exploration-threads/:id/messages', postExplorationMessage);
app.post('/api/exploration-threads/:id/branches', postExplorationBranch);
app.patch('/api/exploration-threads/:id/intent', patchExplorationIntent);
app.post('/api/exploration-messages/:id/verify', postMessageVerification);

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
