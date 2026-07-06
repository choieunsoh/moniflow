# Trip / Foreign-Currency (JPY) View

**Date:** 2026-07-06
**Status:** Approved design, ready for implementation plan
**Feature area:** `src/features/entries/`

## Purpose

The user travels — mainly to Japan. Every foreign-currency entry (JPY, occasionally HKD) already
carries both its original amount and the converted THB amount (`currency` + `originalAmount` on
the `entries` schema, landed in the import/cycle-dashboard slice). Right now that spend is
invisible: it's mixed into the whole-ledger cycle views with no way to see "how much did that trip
cost." This slice adds a read-only `/trips` page that automatically groups foreign-currency
entries into trips and shows each trip's original-currency total alongside its THB total.

This is a pure read view. It does not touch the write path, the schema, or the billing-cycle
dashboard — it is a second, independent lens over the same `entries` table.

## Scope

**In scope**
- A cycle-agnostic read query: all non-THB entries, ordered chronologically.
- Pure trip-grouping logic: partition foreign-currency entries into trips by currency continuity
  and a date-gap heuristic.
- A small foreign-currency money formatter (mirrors `formatBaht` but is currency-parametric).
- A `/trips` page: one card per trip (currency, date range, entry count, original total, THB
  total), with an empty state when there is no foreign-currency data yet.
- A nav link to `/trips`.

**Out of scope (later slices)**
- Manual trip naming or manually adjusting trip boundaries (the grouping is 100% inferred from the
  data; no per-trip metadata table).
- Per-trip budgets (set + track a spend ceiling for a trip).
- A map / geographic view.
- Any change to the import path, schema, or the billing-cycle dashboard — `trips.ts` and the new
  query are additive and read-only.

## Feature-based placement

All of this lives inside the existing `entries` feature, plus one new route. Nothing new enters
`shared/` or `db/`; the dependency arrow stays `features → shared/db`, never back.

```
src/
├── app/
│   ├── trips/page.tsx            # (new) server component — trip cards, empty state
│   └── dashboard/page.tsx        # untouched — separate lens over the same table
├── db/client.ts                  # untouched — connection only, no feature imports
├── features/entries/
│   ├── queries.ts                 # (edit) + getForeignEntries
│   ├── queries.test.ts            # (edit) + getForeignEntries tests
│   ├── trips.ts                   # (new) groupIntoTrips + formatForeign + formatTripRange — pure
│   ├── trips.test.ts              # (new)
│   └── schema.ts                  # untouched — currency/originalAmount already exist
├── shared/
│   ├── money.ts                   # untouched — formatBaht stays THB-only
│   └── ui/Nav.tsx                 # (edit) + /trips link
└── cli.ts                         # untouched
```

## Query (`queries.ts` addition)

```ts
export function getForeignEntries(db: Db): Entry[]
```

`WHERE currency IS NOT NULL AND currency <> 'THB'`, built with drizzle's `and`, `isNotNull`, `ne`
(the same operator family `queries.ts` already imports `and`/`gte`/`lte` from). Ordered by
`entries.date` then `entries.id` (drizzle's default `.orderBy(col)` is ascending — no `asc()`
wrapper needed) so the result is already a single chronological pass; `groupIntoTrips` does not
have to trust that ordering (it re-sorts defensively) but the query gives it for free in the
common case.

Excludes:
- THB rows (`currency = 'THB'` or `currency IS NULL`, which covers legacy/import-null rows) —
  those are the domestic ledger, already fully covered by the cycle dashboard.

## Pure grouping (`trips.ts`)

```ts
export type Trip = {
  currency: string;
  start: string;      // YYYY-MM-DD, inclusive
  end: string;         // YYYY-MM-DD, inclusive
  count: number;
  originalTotal: number; // sum of |originalAmount|, original currency
  thbTotal: number;       // sum of |amount|, THB
};

export function groupIntoTrips(entries: Entry[], gapDays = 5): Trip[]
```

Algorithm: sort the input by date (defensive — the query already sorts, but this function's
contract does not depend on caller ordering), then walk it once. A new trip starts when:
- this is the first entry, **or**
- the entry's currency differs from the current trip's currency, **or**
- the gap in days since the current trip's last entry date **exceeds** `gapDays` (a gap *equal to*
  `gapDays` stays in the same trip — the boundary is deliberately inclusive on the "still one
  trip" side, since a `gapDays`-long layover/weekend inside one trip is normal).

Day gaps are computed the same way `cycle.ts`'s internal `daysBetween` does: `Date.parse(iso +
'T00:00:00Z')` diffed and divided by a day in ms — never string surgery. Each entry accumulates
into the *current* trip: `count += 1`, `originalTotal += Math.abs(originalAmount ?? 0)`, `thbTotal
+= Math.abs(amount)`. Magnitudes, not signed sums — a trip answers "how much moved" (spend +
refunds both count toward the total), not "net flow"; net flow is what the cycle dashboard already
answers. `start`/`end` track the first/last entry date seen in the trip. Empty input → `[]`.

```ts
export function formatForeign(amount: number, currency: string): string
```

A `formatBaht`-shaped helper, parameterized by ISO 4217 currency code:
`new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 })`. Since
the currency varies per call (unlike `formatBaht`, which is always THB), the formatter is built
fresh per call rather than cached as a module-level singleton — trip lists are small (tens of
rows, not thousands), so this is not a hot path. Verified output (Node/ICU, `en-US` locale):
`formatForeign(12345, 'JPY')` → `'¥12,345'`, `formatForeign(500, 'HKD')` → `'HK$500'`.

```ts
export function formatTripRange(trip: Trip): string
```

Mirrors `cycle.ts`'s internal `formatRange`: `Intl.DateTimeFormat('en-GB', { day: '2-digit',
month: 'short', timeZone: 'UTC' })` for each end, showing the year once (at the end) when the trip
stays within one calendar year, or on both ends when it crosses a year boundary — e.g. `'01 Mar –
05 Mar 2019'` vs `'28 Dec 2019 – 03 Jan 2020'`. `cycle.ts`'s `formatRange` is not exported, so this
is a small parallel implementation inside `trips.ts` (feature-local, not worth promoting to
`shared/date.ts` for one caller) rather than an import.

## UI (`app/trips/page.tsx`)

A plain (non-async — no `searchParams`, no other await) server component, same `force-dynamic` /
`initDb()` / `ensureEntriesTable()` boilerplate as `dashboard/page.tsx`:

1. `groupIntoTrips(getForeignEntries(db))`.
2. Empty state (`trips.length === 0`): a `panel` with a short explanation — no foreign-currency
   entries yet.
3. Otherwise, one `panel` card per trip:
   - `chip` showing the currency code (`JPY`, `HKD`, …).
   - `formatTripRange(trip)` — the date range.
   - `{trip.count} entries` (singular when 1).
   - `formatForeign(trip.originalTotal, trip.currency)` as the headline figure (mono/`tnum`).
   - `formatBaht(trip.thbTotal)` as the secondary THB figure.
4. A nav link to `/trips` added to `shared/ui/Nav.tsx`'s `LINKS` array (same pattern as the
   existing `/dashboard` link).

No new shared UI component — the trip card is simple enough to stay inline in the page, matching
the size of `EmptyLedger`/`SummaryBar` but without needing a reusable, multi-consumer component.

## Testing / verification

- `queries.test.ts`: `getForeignEntries` returns only non-THB, non-null-currency rows, ordered by
  date then id.
- `trips.test.ts`:
  - a contiguous run of same-currency entries groups into a single trip with correct totals;
  - a gap that **exceeds** `gapDays` splits into two trips;
  - a gap **equal to** `gapDays` does *not* split (boundary is inclusive);
  - a currency change splits into a new trip even with no date gap;
  - totals use magnitudes — a positive (refund) row still adds to both totals, not subtracts;
  - empty input → `[]`;
  - `formatForeign` renders JPY/HKD with their own currency symbol, no fraction digits;
  - `formatTripRange` renders same-year vs cross-year labels correctly.
- Manual: `npm run build:web`, then `npm run dev:web` and open `/trips` — trip cards render for
  the real JPY history, the nav link highlights when active, and the empty state would show for a
  fresh (all-THB) ledger.
- Gates before each commit (per `CLAUDE.md`): `format:files` changed files → `typecheck` → `lint`
  → `format:check` → `test`.

## Open questions

None outstanding. Decisions locked:
- `gapDays` default = 5, configurable per call (no persisted setting this slice).
- Trip totals are magnitudes (spend-like), not signed net.
- No new schema, no per-trip metadata — grouping is fully derived, every time, from `entries`.
- No shared/cross-feature component; the trip card stays a one-off inline render in
  `app/trips/page.tsx`.
