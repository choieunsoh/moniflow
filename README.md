# Moniflow

A personal, **offline-first, mobile-first spending tracker** that keeps its entire database **in your browser**. No server, no cloud, no account — your financial data never leaves your device unless you explicitly back it up.

Live demo: **[mymoniflow.vercel.app](https://mymoniflow.vercel.app)**

> Moniflow is a static web app shaped like a phone-sized column with a bottom tab bar. It stores signed financial entries in a **SQLite database that lives in the browser** (OPFS, via SQLite WASM) and renders them through a small Next.js UI. It's built for one person tracking their own spending — it imports [Monefy](https://www.monefy.me/) CSV exports and is scoped to a monthly billing cycle with a configurable cutoff day.

## Why it's different

- **The browser is the system of record.** The ledger is a real SQLite database running in a Web Worker over [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system). There is no backend that reads or writes your data.
- **Offline-first & installable.** It's a PWA — install it and it works with no connection.
- **Private by construction.** No auth, because there's no server to enforce it and nothing server-side to breach. Data stays in your own browser's storage, scoped per origin.
- **You own your data.** Export/restore as a Monefy-compatible CSV, or connect Google Drive for automatic, one-way backups to your own Drive (least-privilege `drive.file` scope — the app only ever sees the backup files it created).

## Features

- **Keypad entry** — a Monefy-style calculator keypad for fast expense entry, with per-entry currency conversion.
- **Cycle dashboard** — the current billing cycle's spending as a by-category donut plus a ranked breakdown, with a chart / list toggle.
- **Records** — the cycle's expenses grouped by day, swipe to edit or delete, with live cross-cycle search.
- **Budgets** — standing per-category monthly limits, surfaced on the home view.
- **Analytics** — multi-cycle spending trends.
- **Categories & Accounts** — first-class, with switchable icon sets (emoji / Phosphor / Lucide) and colors.
- **Trips** — foreign-currency spending grouped into trips (non-THB entries surface here).
- **Recurring records** — self-posting rules for subscriptions, bills, and installments, swept on app open.
- **Backup & restore** — Monefy CSV export/restore, plus optional automatic Google Drive backup.

## Tech stack

- **Next.js 16** (App Router, `output: 'export'` — a fully static bundle, servable by any static host)
- **React 19** · **TypeScript 5.9** (strict) · **Tailwind CSS v4**
- **[@sqlite.org/sqlite-wasm](https://github.com/sqlite/sqlite-wasm)** in a worker over OPFS · **Drizzle ORM**
- **ECharts** for charts · **Phosphor** / **Lucide** icons
- **Vitest** for tests (against an in-memory better-sqlite3 shim that mirrors the browser driver)

There is no server layer. Every page is a client component that loads its own data after mount from the browser database; writes go through plain async functions that signal live read-hooks to refetch.

## Getting started

Requires Node 24+.

```bash
npm install
npm run dev:web      # dev server at http://127.0.0.1:4010
```

Other commands:

```bash
npm run build:web    # static export → out/  (deploy to any static host)
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # eslint (flat config, type-aware)
npm test             # vitest
```

Because the ledger lives in the browser, there's no seed data and no `.db` file to point at — open **Settings → Backup** and restore a Monefy CSV export to load data.

> **Note:** browser storage (OPFS) is scoped **per origin**. `127.0.0.1:4010` and `localhost:4010` are *different* origins with separate databases, as is any deployed host. Data does not sync between them — that's what the backup features are for.

### Optional: Google Drive backup

Set a public Google OAuth client ID to enable the Drive backup feature (leave it unset and the feature is simply hidden):

```bash
# .env.local
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

You'll need a Google Cloud OAuth **Web** client with the Drive API enabled, the `drive.file` scope, and your app's origins listed under *Authorized JavaScript origins*. The client ID is public by design (it ships in the bundle); there is no client secret in the browser flow.

## Data & privacy

Moniflow holds **outflows only** — it's a spending tracker, so income is dropped at import and the keypad only enters expenses. Amounts are stored in the smallest unit (satang), with THB as the home currency; user-facing dates render in the Bangkok timezone.

Your data lives in your browser's OPFS storage and is never transmitted anywhere by the app itself. Backups go **only** where you send them: a file you download, or your own Google Drive.

## Development

Before committing, format your changed files then run the gates separately so failures surface individually:

```bash
npm run format:files <changed files>
npm run typecheck
npm run lint
npm run format:check
npm test
```

See [CLAUDE.md](./CLAUDE.md) for architecture and conventions.

## Acknowledgements

Moniflow is an independent project and is **not affiliated with or endorsed by Monefy**. It interoperates with Monefy's CSV export format for import/backup convenience.

## License

No license has been chosen yet, so the default applies: **all rights reserved**. If you'd like others to use, modify, or contribute, add a `LICENSE` file (e.g. MIT).
