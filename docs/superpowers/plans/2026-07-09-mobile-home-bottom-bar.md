# Mobile Home overview + bottom tab bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/` into a mobile-first Home overview and add a mobile-only fixed bottom tab bar with an oversized center "add entry" FAB and a native-`<dialog>` "More" sheet.

**Architecture:** No UI library — extend the existing Tailwind v4 `@theme` token system (`.panel`/`.btn`/`.tap`, `--color-*`). The bottom bar is a `fixed bottom-0` client component shown only below `sm`; desktop keeps the existing top `Nav`. The "More" sheet is a native HTML `<dialog>` (`showModal()`), which gives focus-trap / `Esc` / `::backdrop` / top-layer stacking for free. Home reuses the existing dashboard components and queries — no schema or query changes.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, TypeScript strict, Vitest.

**Conventions to honor (from CLAUDE.md):** no `any`/`as`/`!`/ts-comments; `type` over `interface`; `for..of`; extensionless relative imports; path aliases `@db`/`@features`/`@shared`. Quality gates before every commit:
`npm run format:files <changed files>` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test` (all must pass).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/ui/active-path.ts` (new) | Pure `isActivePath(pathname, href)` helper — the only non-trivial bar logic, unit-tested. |
| `src/shared/ui/active-path.test.ts` (new) | Vitest unit test for the helper. |
| `src/shared/ui/MoreSheet.tsx` (new) | Native-`<dialog>` bottom sheet: Categories/Settings links + About blurb. |
| `src/shared/ui/BottomBar.tsx` (new) | Mobile-only fixed bar: 4 nav slots + center FAB + More button; composes `MoreSheet`. |
| `src/app/globals.css` (modify) | Add `.more-sheet` / `::backdrop` bottom-sheet styles. |
| `src/app/layout.tsx` (modify) | Mount `<BottomBar />`, add mobile bottom-padding to `<main>`, hide footer below `sm`. |
| `src/app/page.tsx` (rewrite) | Home overview (replaces marketing landing; absorbs `/dashboard`). |
| `src/app/dashboard/page.tsx` (delete) | Merged into Home. |
| `src/shared/ui/Nav.tsx` (modify) | Desktop-only now; drop the `Dashboard` link. |

Reused unchanged: `SummaryBar`, `Breakdown`, `CycleSelector`, `CycleProgress`, `LedgerTable`, `EmptyLedger`, and the entries/settings queries.

---

## Task 1: `isActivePath` helper (pure logic, TDD)

**Files:**
- Create: `src/shared/ui/active-path.ts`
- Test: `src/shared/ui/active-path.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/ui/active-path.test.ts
import { describe, expect, it } from 'vitest';
import { isActivePath } from './active-path';

describe('isActivePath', () => {
  it('matches home only on exact "/"', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/budgets', '/')).toBe(false);
  });

  it('matches non-home routes by prefix', () => {
    expect(isActivePath('/budgets', '/budgets')).toBe(true);
    expect(isActivePath('/trips/2', '/trips')).toBe(true);
    expect(isActivePath('/settings', '/budgets')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- active-path`
Expected: FAIL — `isActivePath` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/ui/active-path.ts
// Active-nav matching shared by the top Nav and the mobile BottomBar: home is active only on the
// exact "/", every other route is active when the current path is within it (prefix match).
export function isActivePath(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- active-path`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/shared/ui/active-path.ts src/shared/ui/active-path.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/shared/ui/active-path.ts src/shared/ui/active-path.test.ts
git commit -m "feat(shared): add isActivePath nav-matching helper" -m "Pure, unit-tested active-route matcher reused by the top Nav and the new mobile bottom bar. Home matches only exact /, others match by prefix."
```

---

## Task 2: `MoreSheet` bottom sheet (native `<dialog>`)

**Files:**
- Modify: `src/app/globals.css` (append after the `.tap` block, before the reduced-motion block)
- Create: `src/shared/ui/MoreSheet.tsx`

- [ ] **Step 1: Add the sheet styles to globals.css**

Append this block immediately after the `.tap { … }` rule (around line 163):

```css
/* Bottom sheet built on the native <dialog>. showModal() gives focus-trap, Esc, ::backdrop and
   top-layer stacking for free; we only style position + entrance. */
.more-sheet {
  width: 100%;
  max-width: 100%;
  margin-inline: auto;
  margin-block: auto 0; /* pin to the bottom edge of the viewport */
  padding: 0;
  padding-bottom: env(safe-area-inset-bottom);
  border: none;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--color-surface);
  color: var(--color-text);
}
.more-sheet[open] {
  animation: sheet-up var(--dur) var(--ease-out);
}
.more-sheet::backdrop {
  background: rgba(0, 0, 0, 0.5);
}
@keyframes sheet-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
```

- [ ] **Step 2: Write the MoreSheet component**

```tsx
// src/shared/ui/MoreSheet.tsx
'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

const LINKS = [
  { href: '/categories', label: 'Categories' },
  { href: '/settings', label: 'Settings' },
] as const;

// Bottom sheet for the overflow nav. Controlled by BottomBar via `open`; drives the native <dialog>
// imperatively (showModal/close) so we inherit focus-trap, Esc-to-close and the ::backdrop. Clicking
// the backdrop (event target === the dialog element) or a link closes it.
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="more-sheet sm:hidden"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex flex-col gap-1 p-4">
        <span
          aria-hidden
          className="mx-auto mb-3 h-1 w-10 rounded-full"
          style={{ background: 'var(--color-border-strong)' }}
        />
        <h2 className="px-2 pb-1 text-base font-semibold">More</h2>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={onClose}
            className="tap rounded-[var(--radius-md)] px-2 text-sm font-medium"
            style={{ color: 'var(--color-text)' }}
          >
            {l.label}
          </Link>
        ))}
        <p className="px-2 pt-3 text-xs leading-relaxed" style={{ color: 'var(--color-faint)' }}>
          Moniflow · local-first money flow. Your data stays in a SQLite file on your machine.
        </p>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 3: Typecheck / lint / build-safety**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (No unit test — this is native `<dialog>` DOM behavior with no branching logic, matching the untested `Nav.tsx` convention. There is no React Testing Library / jsdom in this repo and we are not adding one.)

- [ ] **Step 4: Commit**

```bash
npm run format:files src/app/globals.css src/shared/ui/MoreSheet.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/globals.css src/shared/ui/MoreSheet.tsx
git commit -m "feat(shared): add MoreSheet bottom sheet on native dialog" -m "Overflow nav (Categories, Settings, About) as a bottom sheet built on the native <dialog> element — focus-trap, Esc and backdrop come from the platform, no dependency. Styles live with .panel/.btn in globals.css."
```

---

## Task 3: `BottomBar` (mobile-only fixed bar + FAB)

**Files:**
- Create: `src/shared/ui/BottomBar.tsx`

- [ ] **Step 1: Write the BottomBar component**

```tsx
// src/shared/ui/BottomBar.tsx
'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { isActivePath } from './active-path';
import { MoreSheet } from './MoreSheet';

// Mobile-only app-style tab bar. Hidden at >=sm (the top Nav takes over on desktop). Five slots:
// Home · Budgets · [＋ raised FAB → /entries/new] · Trips · More. The FAB overhangs the bar's top
// edge and is visibly larger/primary. z-index matches the header; the More sheet is top-layer above it.
export function BottomBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 border-t backdrop-blur-md sm:hidden"
        style={{
          zIndex: 'var(--z-header)',
          background: 'color-mix(in oklab, var(--color-bg) 82%, transparent)',
          borderColor: 'var(--color-border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <ul className="grid grid-cols-5 items-end">
          <BarLink href="/" label="Home" active={isActivePath(pathname, '/')} icon={<HomeIcon />} />
          <BarLink
            href="/budgets"
            label="Budgets"
            active={isActivePath(pathname, '/budgets')}
            icon={<BudgetsIcon />}
          />
          <li className="flex justify-center">
            <Link
              href="/entries/new"
              aria-label="Add entry"
              className="-mt-5 grid size-14 place-items-center rounded-full shadow-[var(--shadow-2)]"
              style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
            >
              <PlusIcon />
            </Link>
          </li>
          <BarLink
            href="/trips"
            label="Trips"
            active={isActivePath(pathname, '/trips')}
            icon={<TripsIcon />}
          />
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="flex min-h-[44px] w-full flex-col items-center justify-center gap-1 py-2"
              style={{ color: 'var(--color-muted)' }}
            >
              <MoreIcon />
              <span className="text-[0.625rem] font-medium">More</span>
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}

function BarLink({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className="flex min-h-[44px] w-full flex-col items-center justify-center gap-1 py-2"
        style={{ color: active ? 'var(--color-accent-text)' : 'var(--color-muted)' }}
      >
        {icon}
        <span className="text-[0.625rem] font-medium">{label}</span>
      </Link>
    </li>
  );
}

// Inline SVG icons (stroke=currentColor so each inherits its slot's active/muted color). No icon dep.
function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 7 8 2l6 5v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BudgetsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 5.5h11v7h-11z M2.5 5.5 8 2l5.5 3.5 M10.5 9h1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TripsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5c-2.2 0-4 1.7-4 3.9 0 2.9 4 8.1 4 8.1s4-5.2 4-8.1c0-2.2-1.8-3.9-4-3.9z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="5.4" r="1.4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 3h3.5v3.5H3z M9.5 3H13v3.5H9.5z M3 9.5h3.5V13H3z M9.5 9.5H13V13H9.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10 M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck / lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npm run format:files src/shared/ui/BottomBar.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/shared/ui/BottomBar.tsx
git commit -m "feat(shared): add mobile bottom tab bar with center add FAB" -m "Fixed, mobile-only (sm:hidden) 5-slot bar: Home/Budgets/Trips/More plus a raised oversized accent FAB linking to /entries/new. Inline-SVG icons, no icon dependency. More opens the MoreSheet."
```

---

## Task 4: Mount the bar in the layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Import BottomBar**

Add with the other `@shared/ui` imports (near line 5):

```tsx
import { BottomBar } from '@shared/ui/BottomBar';
```

- [ ] **Step 2: Update the body — bottom padding on main, mobile-hide the footer, mount the bar**

Replace the current body block:

```tsx
      <body className="flex min-h-dvh flex-col">
        <AppHeader />
        <main className="flex-1">{children}</main>
        <AppFooter />
      </body>
```

with:

```tsx
      <body className="flex min-h-dvh flex-col">
        <AppHeader />
        {/* pb clears the fixed bottom bar (~56px + FAB overhang + safe area) on mobile; none on desktop. */}
        <main className="flex-1 pb-24 sm:pb-0">{children}</main>
        {/* Footer is desktop-only — it's clutter beneath a mobile tab bar. */}
        <div className="hidden sm:block">
          <AppFooter />
        </div>
        <BottomBar />
      </body>
```

- [ ] **Step 3: Typecheck / lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npm run format:files src/app/layout.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/layout.tsx
git commit -m "feat(app): mount bottom bar and clear it in the layout" -m "Adds mobile bottom-padding to <main> so content never hides behind the fixed bar, hides the footer below sm, and mounts BottomBar."
```

---

## Task 5: Rewrite `/` as the Home overview; delete `/dashboard`

**Files:**
- Rewrite: `src/app/page.tsx`
- Delete: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Replace `src/app/page.tsx` entirely**

```tsx
// Reads the local SQLite DB per request (better-sqlite3 can't be prerendered, and the ledger is
// live data), so opt out of static generation.
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import {
  getCycleSummary,
  getCategoryBreakdown,
  getEntriesInRange,
} from '@features/entries/queries';
import { cycleFromKey, currentCycleKey, cycleProgress } from '@features/entries/cycle';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff } from '@features/settings/queries';
import { todayIso } from '@shared/date';
import { SummaryBar } from '@features/entries/ui/SummaryBar';
import { Breakdown } from '@features/entries/ui/Breakdown';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { CycleProgress } from '@features/entries/ui/CycleProgress';
import { LedgerTable } from '@features/entries/ui/LedgerTable';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Home = the mobile at-a-glance overview (absorbs the old /dashboard): current cycle nav, the four
// summary figures, cycle progress, the top categories, and the most recent entries. The full chart,
// account breakdown and full ledger were deliberately cut (see the design spec). On desktop the
// header carries an Add button; on mobile the bottom-bar FAB does, so the header button is sm-only.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleParam } = await searchParams;
  const db = initDb();
  ensureEntriesTable(db);
  ensureSettingsTable(db);

  const cutoff = getCutoff(db);
  const activeKey = cycleParam ?? currentCycleKey(todayIso(), cutoff);
  const cycle = cycleFromKey(activeKey, cutoff);
  const summary = getCycleSummary(db, cycle.start, cycle.end);
  const entriesInCycle = getEntriesInRange(db, cycle.start, cycle.end);
  const categoryBreakdown = getCategoryBreakdown(db, cycle.start, cycle.end);
  const progress = cycleProgress(cycle, todayIso());

  return (
    <PageContainer size="full">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Your money flow for the {cycle.label} cycle.
          </p>
        </div>
        <Link href="/entries/new" className="btn btn-primary hidden sm:inline-flex">
          ＋ Add entry
        </Link>
      </header>

      <CycleSelector activeKey={activeKey} cutoff={cutoff} />

      {summary.count > 0 ? (
        <>
          <SummaryBar summary={summary} />
          <CycleProgress progress={progress} />
          <Breakdown title="Top categories" rows={categoryBreakdown.slice(0, 5)} />
          <LedgerTable entries={entriesInCycle.slice(-5).reverse()} />
        </>
      ) : (
        <EmptyLedger />
      )}
    </PageContainer>
  );
}
```

- [ ] **Step 2: Delete the dashboard route**

```bash
git rm src/app/dashboard/page.tsx
```

- [ ] **Step 3: Catch any stray `/dashboard` references**

Run: `git grep -n "/dashboard" -- src` (expect: no matches; the marketing page and Nav were the only linkers and both are handled here / in Task 6). If any remain, repoint them to `/`.

- [ ] **Step 4: Typecheck / lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/app/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/page.tsx src/app/dashboard/page.tsx
git commit -m "feat(app): make / the Home overview and delete /dashboard" -m "Replaces the marketing landing with the at-a-glance overview (cycle nav, summary, progress, top 5 categories, recent 5 entries) and merges away /dashboard. Add button is desktop-only; the mobile FAB covers add."
```

---

## Task 6: Make the top `Nav` desktop-only and drop its Dashboard link

**Files:**
- Modify: `src/shared/ui/Nav.tsx`

- [ ] **Step 1: Replace `src/shared/ui/Nav.tsx` entirely**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActivePath } from './active-path';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/categories', label: 'Categories' },
  { href: '/trips', label: 'Trips' },
  { href: '/settings', label: 'Settings' },
] as const;

// Desktop primary nav (hidden below sm — the mobile BottomBar replaces it there). Inline row of
// one-tap items; the active item is tinted with the accent-soft chip.
export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
      {LINKS.map(({ href, label }) => {
        const active = isActivePath(pathname, href);
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

- [ ] **Step 2: Typecheck / lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (Nav now reuses `isActivePath` from Task 1 — one source of truth for active-matching.)

- [ ] **Step 3: Commit**

```bash
npm run format:files src/shared/ui/Nav.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/shared/ui/Nav.tsx
git commit -m "refactor(shared): desktop-only Nav, drop Dashboard, reuse isActivePath" -m "The mobile BottomBar now owns mobile nav, so the top Nav is hidden below sm and loses its mobile scroll strip. Drops the Dashboard link (Home is the overview) and reuses the shared isActivePath helper."
```

---

## Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full gate sweep**

Run: `npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: all PASS.

- [ ] **Step 2: Manual smoke on the running app**

Run: `npm run dev:web` (serves 127.0.0.1:4010). If the DB is empty, seed first: `npm run dev -- seed`. Verify, resizing the browser narrow (<640px) to exercise mobile:
  - `/` shows Overview: cycle selector, summary figures, progress, "Top categories" (≤5 rows), "Recent entries" (≤5).
  - Below `sm`: bottom bar visible with 5 slots; center ＋ is raised and larger; top Nav and footer are hidden; page content is not hidden behind the bar.
  - Tapping ＋ → `/entries/new`; Home/Budgets/Trips highlight the active slot; **More** opens the bottom sheet; backdrop click and `Esc` close it; its links navigate and close it.
  - At `≥sm`: bottom bar hidden, top Nav visible (no Dashboard link), footer visible, header shows the Add button.
  - `/dashboard` returns 404 (route deleted).

- [ ] **Step 3: Confirm complete**

Use `superpowers:verification-before-completion` before claiming done, then `superpowers:finishing-a-development-branch` to integrate.

---

## Self-Review

**Spec coverage:**
- IA / routing (Home at `/`, dashboard + marketing deleted) → Tasks 5, 4, 6. ✅
- Bottom bar (5 slots, oversized center FAB, mobile-only) → Task 3. ✅
- More = native-`<dialog>` bottom sheet (Categories, Settings, About) → Task 2. ✅
- Home content (cycle nav, summary, progress, top categories, recent entries, empty state) → Task 5. ✅
- Desktop keeps top Nav minus Dashboard → Task 6. ✅
- No new dependency; extend token system → all tasks (inline SVG, native `<dialog>`, tokens). ✅
- Cut chart/account-breakdown/full-ledger, leave modules → Task 5 renders none of them; modules untouched. ✅
- Testing approach (pure helper unit-tested; components untested like Nav) → Tasks 1–3. ✅

**Placeholder scan:** No TBD/TODO; every code step is complete and runnable. ✅

**Type consistency:** `isActivePath(pathname, href)` signature identical across Tasks 1, 3, 6. `MoreSheet` props `{ open, onClose }` match between Tasks 2 and 3. Query names (`getCycleSummary`, `getEntriesInRange`, `getCategoryBreakdown`, `getCutoff`, `currentCycleKey`, `cycleFromKey`, `cycleProgress`, `todayIso`) match the existing exports verified in the codebase. Component props (`SummaryBar summary`, `Breakdown title/rows`, `CycleSelector activeKey/cutoff`, `CycleProgress progress`, `LedgerTable entries`) match their definitions. ✅
