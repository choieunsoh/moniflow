# Moniflow

Personal, local-first **money-flow dashboard**. SQLite storage, read through a Drizzle query
layer by Next.js Server Components. Scaffolded on the `portfolio-dashboard` stack.

## Stack

Node 24 · TypeScript 5.9 (strict, ESM) · Next.js 16 (App Router) · React 19 · Tailwind CSS v4 ·
Drizzle ORM + better-sqlite3 · ECharts 6 · commander (CLI) · Vitest · ESLint 10 (flat) · Prettier 3.

## Getting started

```bash
npm install
npm run dev:web     # web app → http://127.0.0.1:4010
npm run dev -- summary   # CLI: net money flow
npm test            # vitest
```

Quality gates — before every commit, format your changes then run the checks separately so
failures surface individually:
`npm run format:files <changed files>`, then `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm test`.

See [CLAUDE.md](./CLAUDE.md) for architecture and conventions.
