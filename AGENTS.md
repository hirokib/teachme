# TeachMe

Local-first learning and exploration monorepo: `backend/` (Express + sql.js) and
`frontend/` (Vite + React).

## UI

Uses **shadcn/ui** on **Radix UI** primitives, styled with **Tailwind CSS v4**.

- Add components with `npx shadcn@latest add <name>` — do not hand-write them.
- Components land in `src/components/ui/` and are **owned by this repo**: edit them
  directly, they are not a versioned dependency.
- Radix arrives transitively as `@radix-ui/react-*` per component. Don't add Radix
  packages by hand.
- Design tokens are CSS variables in `src/App.css` (`--primary`, `--radius`, …).
  Change those, not hardcoded colors.
- `@/*` resolves to `frontend/src/*` — aliased in both `tsconfig.json` and
  `vite.config.ts`; keep them in sync.

## LLM calls

Uses `@earendil-works/pi-ai` with the OpenAI Codex provider and ChatGPT sign-in.

- Provider setup and the model default live in `backend/src/codex.ts`.
- The browser talks only to backend endpoints. Never move credentials or a provider SDK
  into `frontend/`.
- Research and verification enable the Responses API hosted `web_search` tool through
  the same authenticated model layer; do not spawn the Codex CLI.
- ChatGPT OAuth credentials are stored in ignored `backend/auth.json`.
- `OPENAI_CODEX_MODEL` can override the default model.

## Commands

```bash
npm run dev              # both servers (frontend :3000, backend :3001)
cd frontend && npm run lint && npm run build
cd backend  && npm run lint && npm test
```

## Gotchas

- sql.js is WASM SQLite — no native build. Call `saveDb()` after every write;
  nothing else flushes to disk.
- Backend is **ESM** (`type: module`, run with `tsx`) because `ai` v7 ships no
  CJS build. So: no `__dirname` (use `import.meta.url`), and relative imports
  need a `.js` extension (`./db.js`) even though the file is `.ts`.
- ESLint configs are `.mjs`; harmless now that both packages are ESM.
- Never commit AI attribution — a `commit-msg` hook rejects it.
