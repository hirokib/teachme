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

## Commands

```bash
npm run dev              # both servers (frontend :3000, backend :3001)
cd frontend && npm run lint && npm run build
cd backend  && npm run lint && npm test
```

## Gotchas

- sql.js is WASM SQLite — no native build. Call `saveDb()` after every write;
  nothing else flushes to disk.
- ESLint configs are `.mjs` on purpose (packages are `type: commonjs`).
- Never commit AI attribution — a `commit-msg` hook rejects it.
