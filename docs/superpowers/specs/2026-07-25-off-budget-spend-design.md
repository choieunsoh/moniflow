# Off-Budget Spend — Design Spec

**Date:** 2026-07-25
**Branch:** `feat/off-budget-spend`
**Status:** Approved for planning

## Problem

Moniflow's budget meter, pace phrase, and safe-to-spend/day all compute against **total** cycle spend. A large, irregular expense — a yearly insurance bill, tuition, a one-off big purchase — therefore distorts the whole "am I on budget?" view: it blows the meter (a disaster month), guts safe-to-spend (nothing left per day even though normal spending is fine), and — the reason Projected is being cut — wrecks a naïve linear projection. One irregular expense should not poison the "can I afford lunch" math.

The fix: the budget is a **discretionary** budget. Irregular spend stays fully real in the ledger but sits **off-budget** — excluded from the budget-vs-spend math, present everywhere you look at *what you actually spent*.

## Decisions (from the brainstorm)

- **Mechanism = both:** a category-level default plus a per-entry override.
- **Headline shows discretionary + discloses** the off-budget total; the donut stays all-in.
- **Projected is dropped** (redundant with the pace phrase; least robust to big bills).
- **Backup ceiling accepted:** the flags live in OPFS, survive normal use, and are lost only on a full Monefy-CSV *restore* (the format has no column) — documented, like the live-FX ceiling.

## Data model

Two new columns (each added in the feature `schema.ts` **and** `src/db/worker.ts` `BOOTSTRAP_SQL`, with the schema-lockstep test updated — the two-places rule):

- `categories.off_budget` — `INTEGER NOT NULL DEFAULT 0` (0/1). The category-level default.
- `entries.off_budget` — `INTEGER` **nullable tri-state**: `null` = inherit the category, `0` = force *include*, `1` = force *exclude*. The per-entry override, both directions.

**Effective rule** (one pure, tested helper): an entry is off-budget when
`(entry.off_budget ?? (category.off_budget ? 1 : 0)) === 1`.

Type changes:
- `Category` gains `offBudget: number` (0/1). `EntryRow`/`Entry` gain `offBudget: number | null`. `EntryInput` gains `offBudget?: number | null` (write path carries it; defaults `null` = inherit).

## What excludes vs what stays all-in

**Discretionary (excludes effective-off-budget spend):**
- Home budget meter (fill / % / state) and its "Spent this cycle" figure
- The pace phrase ("X% under pace")
- Safe-to-spend / day
- The per-category budget meters on the **Budgets page** (same `toBudgetTotal`/`toBudgetRows`, fed discretionary spend — for consistency)

**All-in (the honest record — unchanged):**
- The ledger, the Records screen, the Home donut / category breakdown, Top transactions, and the Trends/analytics trend + its breakdowns.

**Dropped:** the Projected card.

**Out of scope (v1):** anomaly detection stays all-in — a big yearly bill flagged as "unusual" is technically true; changing the anomaly basis is a separate refinement, not part of this.

## Home layout

- Headline: **"Spent this cycle ฿600 of ฿3,000"** where ฿600 is *discretionary* (the meter's numerator — they must agree). The meter, pace phrase, and safe-to-spend all read discretionary.
- A quiet muted line, shown only when the cycle has off-budget spend: **"+ ฿12,000 off-budget"**. This bridges the gap between the discretionary headline and the all-in donut below.
- The donut / breakdown stays all-in (off-budget entries appear in their categories). Off-budget disclosure applies to *any* cycle on screen (not just the current one), so the disclose figure is a top-level Home datum, not part of the current-cycle "forward" block.
- The forward block loses `projected`; `SafeToSpendCard` stays (now discretionary). `ProjectedCard` is removed.

## Where you set it

- **Entry form** (`/entries/new`, `/entries/edit`): an "Exclude from budget (one-off)" toggle. It reflects the *effective* state (the category's default) and, when flipped, writes the per-entry override (`0`/`1`); left untouched, it stores `null` (inherit).
- **Categories page** (`/categories`): an "off-budget" toggle per category, alongside the existing emoji / hue / archived meta.

## Architecture — units

- `src/features/entries/off-budget.ts` (new, pure, tested): the effective-off-budget predicate and the spend split.
  - `isOffBudget(entry: EntryRow, offBudgetCategories: Set<string>): boolean`
  - `splitBudgetSpend(entries: EntryRow[], offBudgetCategories: Set<string>): { discretionary: number; offBudget: number }` — magnitudes (`Math.abs`), outflows only.
  - `discretionaryByCategory(entries: EntryRow[], offBudgetCategories: Set<string>): Map<string, number>` — for the Budgets page meters.
- Query: `getOffBudgetCategories(db): Promise<Set<string>>` (category names with `off_budget = 1`) — loaded like the existing emoji/hue maps.
- Write path: `addEntries` / entry update carry `off_budget`; a category update sets `off_budget`.
- `useHome`: fetch the off-budget category set; from the already-loaded `cycleEntries` compute `discretionaryTotal` + `offBudgetTotal`; feed `discretionaryTotal` to `toBudgetTotal` / safe-to-spend / pace; expose `offBudgetTotal`; drop `projected`. (`total` stays all-in for the donut.)
- Budgets page hook: build `spentByCategory` from `discretionaryByCategory`.
- Entry form + Categories page: the two toggles.

## Constraints preserved

- Offline / no server / single-user / spending-only (outflows; magnitudes via `Math.abs`).
- TS bans (no `any`/`as`/`!`/ts-comments; `type` over `interface`; `for..of`); money formatters by provenance; `tnum`.
- Reads async, post-mount, `{ ready, data }`; `?cycle=` anchors.
- Schema change touches `schema.ts` + `worker.ts` BOOTSTRAP_SQL + schema-lockstep together (do not drift).

## Backup ceiling (documented)

The `off_budget` flags (category and entry) persist in the browser's OPFS db and survive normal use. A full **Monefy-CSV restore** (replace-all disaster recovery) rebuilds from a format with no off-budget column, so the flags are lost on that path only. A `ponytail:` comment names the ceiling; the upgrade path is a richer native backup that already carries category meta.

## Out of scope

- Anomaly-basis exclusion, a discretionary donut toggle, amortizing/sinking-fund budgeting (that's a budgeting app, not a tracker), and carrying off-budget through Monefy CSV.
