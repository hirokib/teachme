# TeachMe

TeachMe is a small app for exploring a subject and turning it into a learning plan.

You can start a conversation, branch off from an interesting passage, and check an answer
against web sources. You can also generate a curriculum for a topic, study each part with a
tutor, and take short knowledge checks.

Everything runs locally. The React frontend talks to an Express backend, and sql.js stores
plans and conversations in `backend/teachme.db`.

## Requirements

- Node.js 22.19 or newer (`.node-version` selects Node 24)
- A ChatGPT Plus or Pro account with Codex access

## Run it

Install the dependencies:

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..
```

Start the frontend and backend:

```bash
npm run dev
```

Open http://localhost:3000 and sign in from the **Codex chat** page. The sign-in is used
for chat, learning-plan research, and answer verification. Credentials stay on the backend
in the gitignored `backend/auth.json` file.

The frontend runs on port 3000 and the backend on port 3001. Environment overrides are
listed in `backend/.env.example` and `frontend/.env.example`.

## Commands

```bash
npm run dev
npm run lint
npm run build
cd backend && npm test
```

To format either package:

```bash
cd backend && npm run format
cd frontend && npm run format
```

## Local files

`backend/teachme.db` contains the SQLite data and `backend/auth.json` contains the ChatGPT
credentials. Both are excluded from git.

## License

ISC
