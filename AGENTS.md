# TeachMe

Hello-world monorepo: `backend/` (Express + sql.js) and `frontend/` (Vite + React).

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

Uses the **Vercel AI SDK** (`ai`) — provider-agnostic on purpose.

- The provider is named in exactly one place: the `openai(...)` call in
  `backend/src/index.ts`. Swap `@ai-sdk/openai` for another `@ai-sdk/*` package
  and change that line; nothing else moves.
- The API key is server-side only. The browser talks to `POST /api/chat`, never
  to a provider. Never move the key or a provider SDK into `frontend/`.
- `useChat` messages are **part arrays** (`m.parts`), not a `content` string.
- Needs `OPENAI_API_KEY` in `backend/.env`.

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
