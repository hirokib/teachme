# TeachMe

TeachMe supports two server-side OpenAI authentication modes:

- **ChatGPT sign-in for Codex** — open `/chat`, choose **Sign in with ChatGPT**,
  and complete the device-code flow with a ChatGPT Plus or Pro account.
- **OpenAI API key** — set `OPENAI_API_KEY` in `backend/.env` for the original
  AI SDK endpoint.

ChatGPT OAuth credentials are stored locally in `backend/auth.json`, excluded
from git, and refreshed by the backend. They are never sent to the frontend.

sql.js is a WASM build of SQLite — no native module, so no C++ toolchain needed.

## Setup

Node.js 22.19 or newer is required. The repository's `.node-version` selects
Node 24 when using a compatible version manager.

```bash
# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

## Development

Start both servers:

```bash
npm run dev
```

Or start individually:

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:3000

## Linting & Formatting

```bash
cd backend && npm run lint && npm run format
cd frontend && npm run lint && npm run format
```

## Tests

```bash
cd backend && npm test
```

## Build

```bash
cd backend && npm run build
cd frontend && npm run build
```
