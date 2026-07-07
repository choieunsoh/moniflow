# Mobile-First Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whole moniflow web app mobile-first — base styles target a 375px phone and progressively enhance up at `sm`/`lg` — with no horizontal scroll, ≥44px touch targets, a scrollable nav, and the two data tables reflowing to cards on small screens.

**Architecture:** Base (unprefixed) Tailwind classes describe the mobile layout; `sm:` (640px) and `lg:` (1024px) prefixes enhance for larger screens. A new shared `PageContainer` centralizes the page frame (was copy-pasted on 7 pages) and fixes mobile gutters in one place. Two `.btn`/`.tap` CSS changes lift every touch target to 44px. The ledger and categories tables render a stacked card list on mobile and the dense table at `≥sm`.

**Tech Stack:** Next 16 App Router (React 19 Server + Client Components) · Tailwind CSS v4 (`@theme` tokens in `globals.css`) · ECharts (FlowChart).

---

## Design decisions (baked in — raise at go/no-go if you disagree)

1. **Nav = horizontally-scrollable tab row on mobile** (not a hamburger drawer, not a bottom tab bar). Rationale: 6 items exceeds the 5-item bottom-nav guideline; a data app benefits from all destinations staying visible and one-tap (no hidden menu); a scroll strip is the lightest accessible pattern and keeps the existing sticky header. At `≥sm` it's the current inline row.
2. **Wide tables → card transform on mobile** (not horizontal scroll). Horizontal scroll on primary content is a mobile anti-pattern; the ledger (5 cols) and categories (3 cols incl. a form) become stacked cards below `sm`, reverting to the table at `≥sm`.
3. **Extract a shared `PageContainer`.** The wrapper `mx-auto flex max-w-[…] flex-col gap-6 px-5 py-10` is duplicated on 7 pages with only the max-width differing. Centralizing it fixes the mobile gutter (`px-4`/`py-6` on mobile → `px-5`/`py-10` at `sm`) once instead of 7 times. (Home keeps its bespoke hero frame.)

---

## Conventions (read before starting)

- **No unit tests for components/pages/actions** — this repo's established convention. Verify each task with `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test` (the existing suite must stay green) → `npm run build:web`, plus a **browser check at 375px width** on the affected route(s). The dev server runs on **`http://127.0.0.1:4010`** (`npm run dev:web`).
- **Mobile-first:** unprefixed classes = the 375px layout; add `sm:`/`lg:` to enhance up. Never write a desktop base with a `max-*`/mobile override.
- **Touch target = 44px** minimum for anything tappable (buttons, nav links, row actions, form inputs).
- **TS bans (lint errors):** no `any`/`as`/`!`/ts-comments; `type` over `interface`. Path aliases `@shared/*`, `@features/*`, `@db/*`.
- **Gates before every commit:** `npm run format:files <changed>` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test` → `npm run build:web`. All pass.
- **Commit style:** `type(scope): subject` with `-m` body; scopes `app`/`features`/`shared`. Footer lines on every commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/app/globals.css` | modify | `.btn` → 44px + `touch-action`; add `.tap` helper |
| `src/app/layout.tsx` | modify | `min-h-screen` → `min-h-dvh` |
| `src/shared/ui/PageContainer.tsx` | create | Centralized responsive page frame (size variants) |
| `src/app/dashboard/page.tsx` | modify | Use PageContainer; stack header; Add-entry full-width mobile |
| `src/app/entries/new/page.tsx` | modify | Use PageContainer (`form`) |
| `src/app/entries/[id]/edit/page.tsx` | modify | Use PageContainer (`form`) |
| `src/app/budgets/page.tsx` | modify | Use PageContainer (`narrow`); wrap BudgetFormRow |
| `src/app/categories/page.tsx` | modify | Use PageContainer (`wide`); table→card on mobile |
| `src/app/trips/page.tsx` | modify | Use PageContainer (`full`) |
| `src/app/settings/page.tsx` | modify | Use PageContainer (`form`) |
| `src/app/page.tsx` | modify | Mobile gutter only (`px-4 sm:px-5`) |
| `src/shared/ui/AppHeader.tsx` | modify | Stack on mobile; safe-area inset; sm inline row |
| `src/shared/ui/Nav.tsx` | modify | Scrollable tab row; 44px items |
| `src/features/entries/ui/LedgerTable.tsx` | modify | Card list on mobile, table at `≥sm` |
| `src/features/entries/ui/SummaryBar.tsx` | modify | `text-xl sm:text-2xl`; `p-4 sm:p-5` |
| `src/features/entries/ui/CycleSelector.tsx` | modify | Arrows-only on mobile, full labels `≥sm` |
| `src/features/entries/ui/FlowChart.tsx` | modify | Shorter mobile height |
| `src/features/entries/ui/EntryForm.tsx` | modify | Fields → 44px + 16px text + decimal keypad |

---

## Task 1: Touch-target foundation (globals.css)

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Bump `.btn` to a 44px tap target** — in `src/app/globals.css`, add two declarations to the existing `.btn` rule (which currently ends after the `transition` block). Replace the `.btn { … }` block with:

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.9375rem;
  line-height: 1;
  min-height: 44px; /* touch target — WCAG 2.5.5 / Apple HIG 44pt */
  padding: 0.625rem 1rem;
  border-radius: var(--radius-md);
  touch-action: manipulation; /* remove the 300ms tap delay */
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
```

- [ ] **Step 2: Add a `.tap` helper for link-style controls** — append after the `.chip` rule in `globals.css`:

```css
/* 44px tap target for link-style controls (nav items, table-row actions) that aren't .btn. */
.tap {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  touch-action: manipulation;
}
```

- [ ] **Step 3: Verify + commit**

```bash
npm run format:files src/app/globals.css
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web
git add src/app/globals.css
git commit -m "feat(app): raise touch targets to 44px and add .tap helper" -m "Every .btn is now min-height 44px with touch-action: manipulation (no 300ms delay). New .tap utility gives link-style controls (nav, row actions) the same 44px tap height for the mobile-first pass." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 2: Shared `PageContainer` + apply to all data pages

**Files:**
- Create: `src/shared/ui/PageContainer.tsx`
- Modify: `src/app/layout.tsx`, and the 7 data pages + home listed below

- [ ] **Step 1: Create `src/shared/ui/PageContainer.tsx`:**

```tsx
import type { ReactNode } from 'react';

// The single source of the app's page frame: a centered column with responsive gutters (tighter on
// mobile) and a per-page max-width. Replaces the `mx-auto flex max-w-[…] flex-col gap-6 px-5 py-10`
// wrapper that was hand-rolled on every data page, so the mobile gutter/rhythm is fixed in one place.
const WIDTHS = {
  form: 'max-w-[640px]', // entries new/edit, settings
  narrow: 'max-w-[720px]', // budgets
  wide: 'max-w-[840px]', // categories
  full: 'max-w-[1120px]', // dashboard, trips
} as const;

export function PageContainer({
  size = 'full',
  children,
}: {
  size?: keyof typeof WIDTHS;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto flex ${WIDTHS[size]} flex-col gap-6 px-4 py-6 sm:px-5 sm:py-10`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Use `min-h-dvh` in the layout** — in `src/app/layout.tsx`, change the `<body>` className from `flex min-h-screen flex-col` to:

```tsx
      <body className="flex min-h-dvh flex-col">
```

- [ ] **Step 3: Swap each data page's wrapper for `PageContainer`.** For each page below: add the import `import { PageContainer } from '@shared/ui/PageContainer';`, replace the opening wrapper `<div className="mx-auto flex max-w-[…] flex-col gap-6 px-5 py-10">` with `<PageContainer size="…">`, and its matching closing `</div>` with `</PageContainer>`.

| File | Old wrapper max-width | New `size` |
|---|---|---|
| `src/app/dashboard/page.tsx` | `max-w-[1120px]` | `full` |
| `src/app/trips/page.tsx` | `max-w-[1120px]` | `full` |
| `src/app/categories/page.tsx` | `max-w-[840px]` | `wide` |
| `src/app/budgets/page.tsx` | `max-w-[720px]` | `narrow` |
| `src/app/entries/new/page.tsx` | `max-w-[640px]` | `form` |
| `src/app/entries/[id]/edit/page.tsx` | `max-w-[640px]` | `form` |
| `src/app/settings/page.tsx` | `max-w-[640px]` | `form` |

Example (dashboard) — the opening line becomes:

```tsx
    <PageContainer size="full">
```

and the file's final `</div>` (the wrapper close) becomes `</PageContainer>`. Leave every child untouched. (The dashboard `<header>` is restyled in Task 7 — don't touch it here beyond the wrapper swap.)

- [ ] **Step 4: Fix the home page gutter** — `src/app/page.tsx` keeps its bespoke hero frame; only tighten the mobile gutter. Change its wrapper `mx-auto max-w-[1120px] px-5` to:

```tsx
    <div className="mx-auto max-w-[1120px] px-4 sm:px-5">
```

- [ ] **Step 5: Verify + commit**

```bash
npm run format:files src/shared/ui/PageContainer.tsx src/app/layout.tsx src/app/dashboard/page.tsx src/app/trips/page.tsx src/app/categories/page.tsx src/app/budgets/page.tsx src/app/entries/new/page.tsx "src/app/entries/[id]/edit/page.tsx" src/app/settings/page.tsx src/app/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web
```
Then open `http://127.0.0.1:4010/dashboard` at 375px — confirm the gutter is tighter and nothing shifted. Commit:
```bash
git add src/shared/ui/PageContainer.tsx src/app/layout.tsx src/app/dashboard/page.tsx src/app/trips/page.tsx src/app/categories/page.tsx src/app/budgets/page.tsx src/app/entries/new/page.tsx "src/app/entries/[id]/edit/page.tsx" src/app/settings/page.tsx src/app/page.tsx
git commit -m "refactor(shared): centralize the page frame in PageContainer with mobile gutters" -m "Replaces the wrapper duplicated across 7 data pages with one PageContainer (size variants for the differing max-widths), giving tighter mobile gutters (px-4/py-6 → sm:px-5/py-10) in one place. Body uses min-h-dvh. Home keeps its hero frame, gutter tightened." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 3: Responsive header + scrollable nav

**Files:**
- Modify: `src/shared/ui/Nav.tsx`, `src/shared/ui/AppHeader.tsx`

- [ ] **Step 1: Rewrite `src/shared/ui/Nav.tsx`** as a scrollable tab row (full file):

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/categories', label: 'Categories' },
  { href: '/trips', label: 'Trips' },
  { href: '/settings', label: 'Settings' },
] as const;

// Primary nav. On mobile it's a full-width horizontally-scrollable tab row — all six items stay
// reachable and one-tap, no hamburger, no clipped overflow; at ≥sm it collapses to the inline row.
// The `-mx-4 px-4` lets the strip bleed to the screen edges on mobile while keeping the first/last
// item clear of the gutter; each item is a 44px (.tap) target.
export function Nav() {
  const pathname = usePathname();
  return (
    <nav
      className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0"
      aria-label="Primary"
    >
      {LINKS.map(({ href, label }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="tap shrink-0 rounded-[var(--radius-sm)] px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150"
            style={{
              color: active ? 'var(--color-accent-text)' : 'var(--color-muted)',
              background: active ? 'var(--color-accent-soft)' : 'transparent',
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Rewrite `src/shared/ui/AppHeader.tsx`** to stack on mobile (full file):

```tsx
import Link from 'next/link';
import { Wordmark } from './Wordmark';
import { Nav } from './Nav';

export function AppHeader() {
  return (
    <header
      className="sticky top-0 border-b backdrop-blur-md"
      style={{
        zIndex: 'var(--z-header)',
        background: 'color-mix(in oklab, var(--color-bg) 82%, transparent)',
        borderColor: 'var(--color-border)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="mx-auto flex max-w-[1120px] flex-col gap-1 px-4 pb-2 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:pb-0">
        <Link
          href="/"
          className="tap self-start rounded-[var(--radius-sm)] sm:self-auto"
          aria-label="moniflow home"
        >
          <Wordmark />
        </Link>
        <Nav />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Verify + commit** — build, then open `/dashboard` at 375px: the header shows the wordmark on top and the nav as a full-width strip you can swipe through all 6 items; at ≥640px it's the single inline row. No overflow, no clipping.

```bash
npm run format:files src/shared/ui/Nav.tsx src/shared/ui/AppHeader.tsx
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web
git add src/shared/ui/Nav.tsx src/shared/ui/AppHeader.tsx
git commit -m "feat(app): make the header and nav mobile-first" -m "Nav is a full-width horizontally-scrollable tab row on mobile (all 6 items reachable, 44px taps) and the inline row at ≥sm. Header stacks wordmark over nav on mobile, single h-14 row at ≥sm, with a safe-area-inset-top pad for notched devices." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 4: Ledger — cards on mobile, table at `≥sm`

**Files:**
- Modify: `src/features/entries/ui/LedgerTable.tsx`

- [ ] **Step 1: Rewrite `src/features/entries/ui/LedgerTable.tsx`** (full file — a `sm:hidden` card list plus the existing table wrapped in `hidden sm:block`):

```tsx
import Link from 'next/link';
import { formatSignedBaht } from '@shared/money';
import { formatDay } from '@shared/date';
import { deleteEntryAction } from '../actions';
import type { Entry } from '../schema';

// Recent entries. On mobile each row is a stacked card (category + amount, then date/account +
// actions) so nothing scrolls sideways; at ≥sm it's the dense 5-column table. Amount is mono, signed
// AND colored so meaning survives grayscale. Edit/Delete are 44px tap targets on mobile.
export function LedgerTable({ entries }: { entries: Entry[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold">Recent entries</h2>
        <span className="chip">last {entries.length}</span>
      </div>

      {/* Mobile: card list */}
      <ul className="flex flex-col sm:hidden">
        {entries.map((e) => (
          <li key={e.id} className="flex flex-col gap-2 border-t px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="chip">{e.category}</span>
              <span
                className="tnum font-medium whitespace-nowrap"
                style={{ color: e.amount < 0 ? 'var(--color-loss)' : 'var(--color-gain)' }}
              >
                {formatSignedBaht(e.amount)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="tnum" style={{ color: 'var(--color-muted)' }}>
                {formatDay(e.date)} · {e.account}
              </span>
              <span className="flex items-center gap-1">
                <Link
                  href={`/entries/${e.id}/edit`}
                  className="tap rounded px-2 text-sm"
                  style={{ color: 'var(--color-accent-text)' }}
                >
                  Edit
                </Link>
                <form action={deleteEntryAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <button
                    type="submit"
                    className="tap rounded px-2 text-sm"
                    style={{ color: 'var(--color-loss)' }}
                  >
                    Delete
                  </button>
                </form>
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* ≥sm: dense table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}>
              <Th className="text-left">Date</Th>
              <Th className="text-left">Category</Th>
              <Th className="text-left">Account</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className="border-t transition-colors duration-150 hover:bg-[var(--color-surface-2)]"
              >
                <td
                  className="tnum px-5 py-3 whitespace-nowrap"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {formatDay(e.date)}
                </td>
                <td className="px-5 py-3">
                  <span className="chip">{e.category}</span>
                </td>
                <td className="px-5 py-3" style={{ color: 'var(--color-muted)' }}>
                  {e.account}
                </td>
                <td
                  className="tnum px-5 py-3 text-right font-medium whitespace-nowrap"
                  style={{ color: e.amount < 0 ? 'var(--color-loss)' : 'var(--color-gain)' }}
                >
                  {formatSignedBaht(e.amount)}
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-3 text-xs">
                    <Link
                      href={`/entries/${e.id}/edit`}
                      className="hover:underline"
                      style={{ color: 'var(--color-accent-text)' }}
                    >
                      Edit
                    </Link>
                    <form action={deleteEntryAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <button
                        type="submit"
                        className="hover:underline"
                        style={{ color: 'var(--color-loss)' }}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-5 py-2.5 text-xs font-medium ${className}`}>{children}</th>;
}
```

- [ ] **Step 2: Verify + commit** — open `/dashboard` at 375px: recent entries are stacked cards (category + colored amount, then date·account + Edit/Delete), no sideways scroll; at ≥640px the original table is back.

```bash
npm run format:files src/features/entries/ui/LedgerTable.tsx
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web
git add src/features/entries/ui/LedgerTable.tsx
git commit -m "feat(features): reflow the ledger into cards on mobile" -m "Below sm the recent-entries table becomes a stacked card list (category + colored amount, then date/account + 44px Edit/Delete) so it never scrolls sideways; the dense 5-column table returns at ≥sm." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 5: Categories — cards on mobile, table at `≥sm`

**Files:**
- Modify: `src/app/categories/page.tsx`

Note: Task 2 already swapped this page's wrapper to `<PageContainer size="wide">`. This task changes only the `<section className="panel overflow-hidden">` body.

- [ ] **Step 1: Replace the non-empty branch** — in `src/app/categories/page.tsx`, the section currently renders `counts.length === 0 ? <p…> : <div className="overflow-x-auto"><table>…</table></div>`. Replace the `: (…)` (non-empty) branch with a fragment holding a mobile card list plus the existing table:

```tsx
          <>
            {/* Mobile: cards */}
            <ul className="flex flex-col sm:hidden">
              {counts.map((c) => (
                <li key={c.category} className="flex flex-col gap-2 border-t px-4 py-3 first:border-t-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="chip">{c.category}</span>
                    <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                      {c.count}
                    </span>
                  </div>
                  <form action={mergeCategoryAction} className="flex items-center gap-2">
                    <input type="hidden" name="from" value={c.category} />
                    <input
                      name="to"
                      list="category-options"
                      placeholder="new or existing name…"
                      required
                      className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border px-3 text-base"
                      style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                    />
                    <button type="submit" className="btn btn-ghost">
                      Apply
                    </button>
                  </form>
                </li>
              ))}
            </ul>

            {/* ≥sm: table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}>
                    <Th className="text-left">Category</Th>
                    <Th className="text-right">Entries</Th>
                    <Th className="text-left">Rename / merge into</Th>
                  </tr>
                </thead>
                <tbody>
                  {counts.map((c) => (
                    <tr key={c.category} className="border-t">
                      <td className="px-5 py-3">
                        <span className="chip">{c.category}</span>
                      </td>
                      <td className="tnum px-5 py-3 text-right" style={{ color: 'var(--color-muted)' }}>
                        {c.count}
                      </td>
                      <td className="px-5 py-3">
                        <form action={mergeCategoryAction} className="flex items-center gap-2">
                          <input type="hidden" name="from" value={c.category} />
                          <input
                            name="to"
                            list="category-options"
                            placeholder="new or existing name…"
                            required
                            className="min-w-0 flex-1 rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm"
                            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                          />
                          <button type="submit" className="btn btn-ghost">
                            Apply
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
```

(The `<datalist id="category-options">` and the `Th` helper stay as they are — both card and table inputs point at the same datalist.)

- [ ] **Step 2: Verify + commit** — open `/categories` at 375px: each category is a card (chip + count, then a full-width rename input + Apply, input ≥44px and 16px text so iOS won't zoom); the table returns at ≥640px.

```bash
npm run format:files src/app/categories/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web
git add src/app/categories/page.tsx
git commit -m "feat(app): reflow the categories table into cards on mobile" -m "Below sm each category becomes a card (chip + count, then a full-width 44px rename/merge input + Apply); the 3-column table returns at ≥sm. Mobile input uses text-base to avoid iOS auto-zoom." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 6: Cramped rows — budgets form + cycle selector

**Files:**
- Modify: `src/app/budgets/page.tsx`, `src/features/entries/ui/CycleSelector.tsx`

- [ ] **Step 1: Make `BudgetFormRow` wrap on mobile** — in `src/app/budgets/page.tsx`, replace the `BudgetFormRow` function's returned JSX (the `<div className="flex items-center gap-2">…</div>`) with:

```tsx
    <div className="flex flex-wrap items-center gap-2">
      <form action={setBudgetAction} className="flex flex-1 items-center gap-2">
        <input type="hidden" name="category" value={category} />
        <input
          type="number"
          name="amount"
          step="1"
          min="0"
          inputMode="numeric"
          defaultValue={amount ?? ''}
          placeholder="Amount (฿)"
          className="min-h-11 min-w-0 flex-1 rounded px-3 text-base sm:w-32 sm:flex-none"
          style={{
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-2)',
            color: 'var(--color-text)',
          }}
        />
        <button type="submit" className="btn btn-primary">
          Save
        </button>
      </form>
      {showDelete && (
        <form action={deleteBudgetAction}>
          <input type="hidden" name="category" value={category} />
          <button type="submit" className="btn btn-ghost">
            Remove
          </button>
        </form>
      )}
    </div>
```

Changes vs current: outer `flex-wrap`; the Save form is `flex-1` so it takes the row; the number input is `min-h-11 min-w-0 flex-1 text-base` on mobile (full-width, 44px, 16px text → no iOS zoom, numeric keyboard) and reverts to the fixed `sm:w-32 sm:flex-none`. `flex-wrap` lets Remove drop below on the narrowest widths instead of overflowing.

- [ ] **Step 2: Make `CycleSelector` arrows-only on mobile** — rewrite `src/features/entries/ui/CycleSelector.tsx` (full file):

```tsx
import Link from 'next/link';
import { cycleFromKey, stepKey } from '../cycle';

// Prev / current / next cycle navigation. Pure links that swap the ?cycle= param and re-render the
// server component — no client state. On mobile the prev/next labels collapse to just ← / → (the
// active label stays centered) so three month-ranges don't cram one row; full labels return at ≥sm.
// `cutoff` is required so labels match whatever the caller resolved from settings.
export function CycleSelector({ activeKey, cutoff }: { activeKey: string; cutoff: number }) {
  const active = cycleFromKey(activeKey, cutoff);
  const prev = stepKey(activeKey, -1);
  const next = stepKey(activeKey, 1);
  const prevLabel = cycleFromKey(prev, cutoff).label;
  const nextLabel = cycleFromKey(next, cutoff).label;
  return (
    <nav className="panel flex items-center justify-between gap-2 p-2 sm:p-3">
      <Link
        href={`?cycle=${prev}`}
        aria-label={`Previous cycle: ${prevLabel}`}
        className="tap rounded px-3 text-sm hover:underline"
      >
        <span aria-hidden="true">←</span>
        <span className="hidden sm:inline">&nbsp;{prevLabel}</span>
      </Link>
      <span className="text-sm font-semibold">{active.label}</span>
      <Link
        href={`?cycle=${next}`}
        aria-label={`Next cycle: ${nextLabel}`}
        className="tap rounded px-3 text-sm hover:underline"
      >
        <span className="hidden sm:inline">{nextLabel}&nbsp;</span>
        <span aria-hidden="true">→</span>
      </Link>
    </nav>
  );
}
```

- [ ] **Step 3: Verify + commit** — `/budgets` at 375px: the amount input fills the row, Save beside it, Remove wraps below if needed — no overflow. `/dashboard` at 375px: the cycle selector reads `←  [18 Jun – 17 Jul 2026]  →`; at ≥640px the prev/next month labels are back.

```bash
npm run format:files src/app/budgets/page.tsx src/features/entries/ui/CycleSelector.tsx
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web
git add src/app/budgets/page.tsx src/features/entries/ui/CycleSelector.tsx
git commit -m "feat(app): unbreak the budgets row and cycle selector on mobile" -m "BudgetFormRow wraps and the amount input goes full-width/44px/numeric on mobile (fixed 128px at sm). CycleSelector collapses prev/next to arrow-only on mobile (aria-labels keep the target cycle) so three month-ranges don't cram 375px; full labels at ≥sm." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 7: Dashboard header + summary + chart polish

**Files:**
- Modify: `src/app/dashboard/page.tsx`, `src/features/entries/ui/SummaryBar.tsx`, `src/features/entries/ui/FlowChart.tsx`

- [ ] **Step 1: Stack the dashboard header on mobile** — in `src/app/dashboard/page.tsx`, replace the `<header …>…</header>` block with:

```tsx
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Your money flow for the {cycle.label} billing cycle.
          </p>
        </div>
        <Link href="/entries/new" className="btn btn-primary w-full sm:w-auto">
          ＋ Add entry
        </Link>
      </header>
```

(Mobile: title/subtitle stacked, then a full-width Add-entry button. `≥sm`: the original row with an auto-width button.)

- [ ] **Step 2: Ease the summary figures on mobile** — in `src/features/entries/ui/SummaryBar.tsx`, change the two cell classes:
  - the cell `<div … className="flex flex-col gap-1.5 p-5">` → `className="flex flex-col gap-1.5 p-4 sm:p-5"`
  - the value `<dd className="tnum text-2xl font-semibold" …>` → `className="tnum text-xl font-semibold sm:text-2xl"`

(Large signed-baht figures no longer crowd the 2-column mobile grid; full size returns at `≥sm`.)

- [ ] **Step 3: Shorter chart on mobile** — in `src/features/entries/ui/FlowChart.tsx`, change the ECharts container class `h-[260px] w-full` to:

```tsx
    className="h-56 w-full sm:h-[260px]"
```

(The existing `resize` listener already reflows the canvas to the container width; this just trims the height to 224px on phones. Verify the exact current `className` on the chart `<div>` reads `h-[260px] w-full` before editing — replace only the height token, keep any `ref`/`role`/other attributes.)

- [ ] **Step 4: Verify + commit** — `/dashboard` at 375px: header stacked with a full-width Add-entry; summary figures fit the 2-up grid; chart is a touch shorter. At `≥sm` everything matches the old desktop look.

```bash
npm run format:files src/app/dashboard/page.tsx src/features/entries/ui/SummaryBar.tsx src/features/entries/ui/FlowChart.tsx
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web
git add src/app/dashboard/page.tsx src/features/entries/ui/SummaryBar.tsx src/features/entries/ui/FlowChart.tsx
git commit -m "feat(app): mobile-first dashboard header, summary, and chart" -m "Dashboard header stacks with a full-width Add-entry on mobile (inline row at sm). Summary figures step down to text-xl and p-4 on mobile so the 2-up grid isn't crowded. FlowChart is h-56 on phones, h-[260px] at sm." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 8: Form inputs — 44px height, no iOS zoom, mobile keypads

**Files:**
- Modify: `src/features/entries/ui/EntryForm.tsx`, `src/app/settings/page.tsx`

- [ ] **Step 1: Lift every EntryForm field to a 44px, 16px input** — in `src/features/entries/ui/EntryForm.tsx`, change the shared field class (currently `const fieldClass = 'rounded-[var(--radius-sm)] border px-3 py-2';`) to:

```tsx
const fieldClass = 'min-h-11 rounded-[var(--radius-sm)] border px-3 py-2 text-base';
```

This lifts all eight fields (account, category, currency select, amount, thb, date, time, note) to a 44px tap height and 16px text — so mobile Safari won't auto-zoom on focus (it zooms any input under 16px).

- [ ] **Step 2: Add a decimal keypad to the two amount inputs** — add `inputMode="decimal"` to the `name="amount"` input and the `name="thb"` input. The amount input becomes:

```tsx
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={entry ? Math.abs(entry.originalAmount ?? entry.amount) : undefined}
            required
            className={`tnum ${fieldClass}`}
            style={fieldStyle}
          />
```

and the `name="thb"` input gains the same `inputMode="decimal"` line (keep all its other attributes).

- [ ] **Step 3: Fix the settings cutoff input** — in `src/app/settings/page.tsx`, replace the cutoff `<input>` with (adds `min-h-11`, `text-base` in place of `text-sm`, and a numeric keypad):

```tsx
          <input
            id="day"
            name="day"
            type="number"
            min={1}
            max={28}
            inputMode="numeric"
            defaultValue={cutoff}
            required
            className="w-24 min-h-11 rounded-[var(--radius-sm)] border px-3 py-2 text-base"
            style={{ borderColor: 'var(--color-border)' }}
          />
```

- [ ] **Step 4: Verify + commit** — `/entries/new` and `/settings` at 375px: every input is ≥44px tall, focusing one does NOT zoom the page, and number fields raise a numeric/decimal keypad.

```bash
npm run format:files src/features/entries/ui/EntryForm.tsx src/app/settings/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web
git add src/features/entries/ui/EntryForm.tsx src/app/settings/page.tsx
git commit -m "feat(features): 44px form inputs with mobile keypads and no iOS zoom" -m "EntryForm's shared field class and the settings cutoff input go to min-h-11 + text-base (16px avoids iOS focus-zoom); amount/thb use inputMode=decimal and the cutoff uses inputMode=numeric for the right mobile keyboard." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 9: Full 375px verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Build + suite**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web
```
Expected: all green; `build:web` compiles all 9 routes.

- [ ] **Step 2: Walk every route at 375px** — `npm run dev:web`, then (browser devtools at 375×812, or Playwright) visit each and confirm **no horizontal page scroll** and taps look ≥44px:
  1. `/` — hero, CTAs, steps stack.
  2. `/dashboard` — scrollable nav; stacked header + full-width Add-entry; cycle selector arrows-only; summary 2-up readable; breakdowns stacked; chart fits; **recent entries are cards**.
  3. `/entries/new` and `/entries/[id]/edit` — form fields full-width, single column, ≥44px inputs.
  4. `/budgets` — total + category rows: full-width amount input, Save/Remove wrap, no overflow.
  5. `/categories` — **category cards** with full-width rename input + Apply.
  6. `/trips` — trip cards wrap.
  7. `/settings` — cutoff input + Save fit.
  Then resize to ≥640px and confirm the desktop layouts (inline nav, both tables, 4-up summary, 2-up breakdowns) are intact.

- [ ] **Step 3: Commit any final fixes** discovered in the sweep (if none, nothing to commit).

```bash
git add -A
git commit -m "fix(app): mobile-first sweep adjustments" -m "Final 375px pass across all routes: <describe any fixes, or state none needed>." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Done — definition of complete

- No route scrolls horizontally at 375px; every route is usable one-handed.
- Nav is a scrollable tab row on mobile (all 6 items, 44px taps), inline at `≥sm`.
- Ledger and categories reflow to cards on mobile; both tables return at `≥sm`.
- All buttons, nav items, row actions, and form inputs are ≥44px tap targets.
- Page frame is centralized in `PageContainer`; mobile gutters are `px-4/py-6`, `sm:px-5/py-10`.
- `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web` all pass; the existing 91 tests stay green.

## Deferred (explicitly not in this slice)

- A light theme (tokens already indirect through vars; not part of mobile-first).
- Virtualizing long lists (`/categories`, `/budgets` can be 50+ rows) — only worth it if scroll feels heavy.
- A bottom tab bar or PWA install / offline — larger product decisions beyond a responsive pass.
- Landscape-specific tuning and Dynamic-Type stress testing (basic reduced-motion is already handled in `globals.css`).
