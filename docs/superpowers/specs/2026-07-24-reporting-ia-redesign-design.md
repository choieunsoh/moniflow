# Reporting IA Redesign — Design Spec

**Date:** 2026-07-24
**Branch:** `feat/reporting-ia-redesign`
**Status:** Approved for planning

## Problem

Moniflow has **three** overlapping reporting surfaces, and their roles collide:

| Surface | Its question (from the code) | Where it lives today |
| --- | --- | --- |
| **Home** `/` | "what did I spend this cycle" | bottom tab |
| **Dashboard** `/dashboard` | "where is this cycle heading, can I afford the rest" | bottom tab |
| **Analytics** `/analytics` | "is that normal for me" | buried in the More sheet |

Two concrete smells:

1. **Home and Dashboard are both current-cycle views, and each holds a premium bottom-tab slot** — two of only four real nav slots spent on one time-context. They are two halves of one story ("what I spent" + "where it's heading").
2. **`SpendHeatmap`, `TopNotesList`, and `AnomalyBanner` render on *both* Dashboard and Analytics** — the same components with two homes.

Meanwhile the one genuinely distinct surface — Analytics ("is this normal, over time") — is the one hidden in the overflow sheet.

## Decision

**Approach A:** merge Home + Dashboard into one current-cycle screen; keep Analytics as the history screen and promote it into the bottom bar. Two clean surfaces mapped to a real mental boundary — **this cycle** vs **across cycles** — with zero widget duplication.

Rejected alternatives:
- **B — single unified "Insights" scroll:** mixes current-cycle and 6-cycle `?cycle=` semantics on one page, buries the daily donut under a long phone scroll, makes one screen do three jobs.
- **C — keep three, only de-duplicate widgets:** leaves the two-current-cycle-tabs redundancy (the actual structural problem) untouched.

## Navigation

```
Bottom bar:  Home · Records · [＋] · Trends · More
             (was:  Home · Records · [＋] · Dashboard · More)
More sheet:  Budgets · Categories · Accounts · Trips · Recurring · Settings
             (Analytics removed — it is now the "Trends" tab)
```

- `/dashboard` route is **deleted**; its figures move onto `/`.
- `/analytics` is **promoted** to the bar, relabeled **Trends** (shorter — survives the 5-column label truncation better than "Analytics"). The route path stays `/analytics`.
- The Home tab keeps the label **Home**.
- `MoreSheet` drops its `/analytics` entry.

## Screen 1 — "This cycle" (`/`, merged Home + Dashboard)

Current-cycle overview. `?cycle=` still pages back through history. **The forward-looking figures render only for the current cycle** (they only mean something looking ahead); paging to a past cycle hides them and leaves the donut/breakdown — which is exactly what Home does today.

Vertical stack:

1. **Cycle selector + progress** — existing (`CycleSelector`, `CycleProgress`).
2. **Headline panel** — the existing Home headline (Spent this cycle ฿X, of ฿budget, budget meter, pace phrase) **with the Dashboard forward figures folded in**: `Safe to spend ฿N/day · Projected ฿Y`. Current cycle only.
3. **Upcoming bills** — from Dashboard (committed recurring due before cycle end). Current cycle only.
4. **Chart / List toggle** — existing (`ViewToggle`).
5. **Donut / category breakdown** — existing (`DonutChart` / `Breakdown`). The "what did I spend" answer, constant across both views.
6. **Top transactions (NEW)** — top 3 entries this cycle by `abs(amount)`, with a "See all" that links to Records sorted by amount. Current cycle. (Phase 2.)

**Dropped from the old Dashboard:**
- *Recent activity* — the Records tab is one tap away; pure duplication.
- *This-vs-last-cycle delta* — a comparison, so it moves to Trends (below).

## Screen 2 — "Trends" (`/analytics`, promoted to a tab)

The "is this normal / where does my money flow" surface, and now the **single home** for the widgets that were duplicated.

Vertical stack:

1. **Anomaly banner** — existing (`AnomalyBanner`); no longer also on Dashboard.
2. **6-cycle trend + budget line + own-average** — existing (`TrendChart`).
3. **This-vs-last delta (MOVED here)** — the latest trend point, verbalized.
4. **Category breakdown (window)** — existing; tap a row to filter the trend. Gains a **`[By category | By account]` toggle (NEW)** — spending-by-account lives here as a second grouping of the same window, not a new page. (Phase 3.)
5. **Spend heatmap** — existing (`SpendHeatmap`); single home now.
6. **Top notes** — existing (`TopNotesList`); single home now.

**Spending-by-account placement rationale:** it belongs on Trends, not the daily screen — it is an analytical "where does my money flow from" question, and keeping it off the This-cycle screen avoids two competing axes there (Chart/List *and* Category/Account).

## New reporting features

- **Top transactions** — the N largest single expenses in a cycle by `abs(amount)`. Mirrors the existing `topNotes` pattern (pure function + a list). The ledger stores outflows negative, so rank by magnitude.
- **Spending by account** — the window's spend grouped by account instead of category. Reuses the `getCategoryBreakdown` shaping, keyed by account id; rendered by the existing breakdown list under a grouping toggle.

## Build phasing

1. **Core IA (the restructure).** Merge Home + Dashboard onto `/`; move `SpendHeatmap` / `TopNotesList` / `AnomalyBanner` to Trends only; move the this-vs-last delta to Trends; promote Analytics → **Trends** tab; delete `/dashboard`; drop Analytics from `MoreSheet`; relabel. **Ships the whole restructure on its own.**
2. **Top transactions** on This cycle (additive).
3. **Spending-by-account** toggle on Trends (additive).

Phases 2 and 3 are independent and optional — Phase 1 is complete and shippable alone.

## Constraints preserved

- Offline-first, no server, single-user, spending-only (outflows) — nothing here adds income, sync, or a backend.
- All new math is pure and co-located with a `*.test.ts` (mirrors `dashboard.ts` / `by-note.ts`).
- `?cycle=` continues to anchor both screens to the same selected cycle.
- Row shaping stays positional-array across both db backends (no change to the db seam).

## Out of scope

- Receipt photos, total/rollover budgets, refunds, account transfers, quick-add templates (separate future specs).
- Year-over-year comparison, PDF/report export, push reminders (constraint-blocked or low-ROI).
