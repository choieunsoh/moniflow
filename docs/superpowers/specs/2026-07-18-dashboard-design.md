# Dashboard — design

**Date:** 2026-07-18
**Status:** approved, ready for implementation plan

## Summary

A new **current-cycle overview screen** at `/dashboard` that pulls four forward-looking / at-a-glance
signals into one place — signals neither Home nor Analytics surface today. Home (this-cycle donut +
breakdown) stays exactly as it is. The dashboard takes the **Analytics bottom-bar tab slot**;
Analytics moves into the More sheet.

The screen is **inherently current-cycle only**: three of its four widgets need days *remaining* in
the cycle, which a past cycle doesn't have. So — unlike Home and Analytics — it does **not** follow
the `?cycle=` selector.

## Motivation

Moniflow already has two dashboard-shaped surfaces, split by the question each answers:

- **Home (`/`)** — *"what did I spend this cycle?"* (donut, category breakdown, budget meter, pace).
- **Analytics (`/analytics`)** — *"is that normal for me?"* (6-cycle trend, own-average line, budget
  line).

Neither answers *"where is this cycle heading, and can I still afford the rest of it?"* — the
forward-looking question. That gap is the dashboard's reason to exist. Every widget on it must beat
"just look at Home/Analytics," or it doesn't belong.

## Navigation

- **New route:** `src/app/dashboard/page.tsx` — `'use client'`, same shape as Home/Analytics: a `…`
  loading placeholder until the read hook is `ready`, then the cards.
- **Bottom bar** (`src/shared/ui/BottomBar.tsx`): the Analytics slot (`/analytics`, `AnalyticsIcon`)
  becomes **Dashboard** (`/dashboard`, new glyph). This tab is **bare** — no `?cycle=` — because the
  dashboard is always the current cycle.
- **More sheet** (`src/shared/ui/MoreSheet.tsx`): Analytics joins the `LINKS` grid with `cycle: true`
  (it reads `?cycle=`, exactly as Budgets does) and a lucide icon (`LineChart` or `TrendingUp`).
- **Active-path:** `/dashboard` highlights its tab via the existing `isActivePath` helper.

This repeats an existing precedent — the `MoreSheet` header already notes *"Budgets landed here when
Analytics took its tab slot."* Analytics now gives up its tab the same way. The `cycle: true` flag
already exists for exactly this case.

## Widgets

All four are **current cycle**. Layout: a vertical stack of `.panel` cards, mobile-column, matching
Home/Analytics. Every figure uses the existing money formatters (`formatBahtWhole` for glance
figures).

### 1. Safe to spend / day
- `remaining = totalBudget − spent`
- `daysLeft = progress.total − progress.day + 1` (today inclusive)
- `safe = max(0, remaining) / daysLeft`
- **No total budget set** → show the *actual* average instead (`spent / daysElapsed`) with a quiet
  "Set a total budget" link; do not invent a safe-to-spend number with no budget to divide against.
- **Over budget** (`remaining < 0`) → `฿0` with an "over budget" note.

### 2. Projected cycle total
- `projected = spent / daysElapsed × cycleLength` (linear pace projection)
- Compare to total budget → over/under verdict.
- **Too early** (`daysElapsed < 3`) → too little elapsed to project sanely (a single early expense
  skews it wildly); show "too early to project" until day 3 of the cycle. Threshold lives as a named
  constant in `dashboard.ts` so it's tunable in one place.
- **No total budget** → show the projected number, drop the verdict.

### 3. This cycle vs last
- prev cycle total: `getCycleSummary(cycleFromKey(stepKey(currentKey, -1)))`
- `delta = total − prevTotal`, with direction (up/down) and the comparison figure.
- **No prior cycle** (delta is null) → "no earlier cycle to compare yet" — the same honesty about
  thin history that Analytics already applies.

### 4. Recent activity
- `getEntriesInRange(cycle)` → sort by `date` desc → take 5. (A cycle is ~a month of rows — tiny —
  so slicing in JS needs no new query.)
- Each row taps through to `/records`, so the dashboard doubles as a "did that expense save?" check.
- Fewer than 5 → show what exists.
- **Scope decision:** recent activity is scoped to the **current cycle**, not the global ledger, so
  the whole screen answers one question.

### Empty state
If the cycle has no spend at all, the whole page falls back to the shared `EmptyLedger` component —
the same choice Analytics makes (it teaches the interface instead of saying "no data").

## Code structure

Follows the codebase's pure-core / hook-orchestration seam (`donut.ts`, `trend.ts`, `breakdown.ts`
are pure and tested; the `use-*.ts` hooks feed them DB rows).

- **`src/features/entries/dashboard.ts`** — pure, no DB / no React: `safeToSpendPerDay()`,
  `projectCycleTotal()`, `cycleDelta()`. The TDD core.
  - **`src/features/entries/dashboard.test.ts`** — every edge case above becomes an assertion:
    over-budget → 0, day-1 → no projection, no-prior-cycle → null, no-budget fallbacks.
- **`src/features/entries/use-dashboard.ts`** — the read hook. Reuses the **pure** `cycle` and
  `budget-status` helpers that `useHome` uses; it does **not** duplicate `useHome`'s query
  orchestration wholesale. Extra reads beyond Home's: previous-cycle total + the recent-entries slice.
  - **`src/features/entries/use-dashboard.test.ts`** — `renderHook` test (per the custom-hooks-are-
    first-class rule).
- **`src/features/entries/ui/DashboardCards.tsx`** — the four widgets as small presentational
  components in **one file** (none is reused elsewhere; split later if one grows).
- **Edits:** `BottomBar.tsx` (swap tab + new icon), `MoreSheet.tsx` (add Analytics link).

## Decisions made (not open questions)

1. **Current-cycle only** — no `?cycle=` following; forward-looking widgets are meaningless on a past
   cycle.
2. **Recent activity scoped to the current cycle**, not the global ledger.
3. **Four widgets in one UI file**, not four files.
4. **Dashboard takes the Analytics tab; Analytics → More sheet** (keeps Home untouched).

## Out of scope (YAGNI)

- Customizable / rearrangeable widgets — fixed layout only.
- Account balances, upcoming recurring charges, active-trip spend as dashboard cards — not requested;
  each would have to earn its place separately later.
- Any change to Home or to Analytics' own content (only its navigation entry moves).
