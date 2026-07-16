# Recurring records — design

Date: 2026-07-16
Status: approved, pending implementation plan

## Problem

Fixed monthly outflows — subscriptions (Netflix, iCloud), bills (rent, phone), and installments
(a fridge over 12 months) — are hand-entered every cycle. They are the most predictable spending in
the ledger and the most tedious to type. Two of them are awkward in ways the keypad does not cover:

- **FX subscriptions** are billed in USD, so the THB actually charged moves with the rate. Entering
  them by hand means looking up a rate every month.
- **Installments** have a known end (12 payments) and a position (this is #4 of 12). Nothing in the
  ledger records that, so "how many are left on the fridge?" is unanswerable.

## Goals

- Recurring outflows post themselves, dated correctly, with no typing.
- A page that answers "what am I locked into per month?" and "how many installment payments are left?"
- FX rules convert at the rate that applied **on the due date**, not the date the app happened to open.
- Restoring a backup leaves the ledger whole, not full of holes.

## Non-goals

- Weekly, N-monthly, or arbitrary custom schedules. Monthly and yearly only. Weekly breaks the
  day-of-month anchor and needs a separate date-stepping path; it was not asked for.
- Forecasting still-due recurring spend into the home donut or budget meters. The ledger holds what
  has come due; the recurring page holds what is coming.
- Exporting rules in the backup. The backup is Monefy-compatible CSV, which has no column to carry
  them. Rules survive a restore in place — see "Backup and restore".
- Income/inflow rules. The ledger is outflows only (see CLAUDE.md); rules are too.

## Decisions

| Decision                | Choice                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| Posting                 | Auto-post on app open, dated the due date. No review queue.        |
| FX rate                 | Live ECB fixing **for the due date** + card fee; per-rule pin overrides |
| FX fetch failure        | Fall back to the cached rate and post anyway — never block         |
| Installment position    | Written into the entry note: `Fridge (4/12)`                       |
| Restore                 | Rewind rule pointers to the CSV's newest date; sweep refills       |
| Frequency               | Monthly (`interval_months` 1) or yearly (12)                       |

## Architecture

New feature slice at `src/features/recurring/`, following the existing feature-based layout. It owns
its schema, pure schedule math, queries, actions, hooks, and UI. It depends on `@db`, `@shared`, and
reads `categories`/`accounts` for its FKs — the dependency arrow points the established way.

### The central design choice: one pointer, everything derives

A rule stores exactly one mutable field: **`last_posted`**. The payment number, the paid count, the
remaining count, and whether an installment is finished are all **computed** from it.

The obvious alternative — storing a `seq` counter that increments on each post — was rejected because
it breaks the restore rewind. A rewind would have to unwind `last_posted` *and* `seq` in lockstep:
clamp the date back, count how many posts that undid, decrement `seq` by exactly that many. Two
pointers, one of which can silently drift. A drifted `seq` writes `(7/12)` where `(6/12)` belongs,
forever, with nothing to detect it.

With one pointer, rewinding the date rewinds the counter automatically, because the counter was never
stored. This is what makes the restore behaviour safe rather than merely plausible.

### Schema — ONE new table

`recurrences`. Per CLAUDE.md the DDL lives in **two places that must stay in lockstep**:

1. `src/features/recurring/schema.ts` — the drizzle table + `ensureRecurrencesTable(db)`, which also
   calls `ensureCategoriesTable` / `ensureAccountsTable` (the pattern `ensureEntriesTable` sets, so
   calling it alone yields a queryable table).
2. `BOOTSTRAP_SQL` in `src/db/worker.ts` — the identical DDL as a seventh entry. Its comment stops
   saying "six-table".

**Missing (2) passes every test and breaks the real browser** — tests run against the Node shim, which
reads `schema.ts`. Only the OPFS smoke check catches the drift.

```ts
export const recurrences = sqliteTable('recurrences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(), // 'Netflix' — becomes the entry note
  day: integer('day').notNull(), // 1–31, clamped to month length at post
  intervalMonths: integer('interval_months').notNull().default(1), // 1 = monthly, 12 = yearly
  accountId: integer('account_id'), // FK → accounts.id
  categoryId: integer('category_id'), // FK → categories.id
  amount: real('amount').notNull(), // POSITIVE magnitude; the sweep negates on post
  currency: text('currency'), // null/'THB' = plain; 'USD' = FX rule
  rate: real('rate'), // null = live ECB+fee; set = pinned
  totalCount: integer('total_count'), // null = subscription; 12 = installment
  startSeq: integer('start_seq').notNull().default(1), // "next is #4" → 4
  startDate: text('start_date').notNull(), // YYYY-MM-DD, the first due date (pre-clamped)
  lastPosted: text('last_posted'), // YYYY-MM-DD; null = never posted. THE only mutable pointer
  archived: integer('archived').notNull().default(0),
});
```

`amount` is stored positive because a bill reads as "฿2,000/mo" in the form. The sweep negates it,
preserving the ledger invariant that every stored row is negative.

`entries` is **not** touched. That is what the note-based installment counter buys: the donut,
breakdown, records, search, budgets, trips, and the CSV export all keep working with zero read-path
changes.

### The pure core — `recurring/schedule.ts`

No DB, no network, no React. Every edge case is pinned here with co-located tests.

The due-date sequence is deterministic from `startDate` and `day`:

```
D_0 = startDate                                       (already clamped)
D_i = clampDay(ym(startDate) + i × intervalMonths, day)
seq(D_i) = startSeq + i
exhausted at i where totalCount !== null && startSeq + i > totalCount
```

`startDate` is stored pre-clamped as the first due date, while `day` remains the canonical anchor —
so a rule on the 31st starting in February has `startDate = 2026-02-28` and `day = 31`, and still
fires on the 31st in March. Deriving `day` from `startDate` would lose that.

Exported functions:

- `clampDay(year, month, day): string` — a rule on the 31st fires Feb 28 (29 in a leap year), not never.
- `dueDates(rule, todayIso): string[]` — every `D_i` where `D_i > lastPosted` (or `>= startDate` when
  `lastPosted` is null), `D_i <= todayIso`, and not exhausted. Ordered.
- `seqOf(rule, date): number`
- `progressOf(rule): { paid: number; total: number | null; remaining: number | null }` — for the page.

### The sweep — `recurring/sweep.ts` + `use-recurring-sweep.ts`

There is no server, so **opening the app is the scheduler**. `useRecurringSweep()` runs once per
session from `src/app/layout.tsx` (already `'use client'`):

1. Load non-archived rules.
2. `dueDates(rule, todayIso)` for each → the pending posts.
3. Resolve a rate per pending post (see below).
4. Insert as ordinary entries via the entries query layer, note = `name` or `name (seq/total)`.
5. Advance `last_posted` to the newest date posted.
6. `bumpDataVersion()` if anything posted, so every live read hook refetches.

**Idempotency falls out of the pointer** — a second sweep the same day computes an empty due list.
No lock and no "last swept" timestamp is needed, in the db or anywhere else.

"Once per session" is therefore only an optimisation, not a correctness requirement: the sweep is
memoized behind a module-level promise, the same shape `getBrowserDb()` already uses. A double-invoke
under React strict mode awaits the same promise rather than sweeping twice — and even if it did sweep
twice, the pointer makes the second one a no-op.

**Ordering:** read hooks mount and fetch concurrently with the sweep, so a first paint can briefly
show pre-sweep numbers before `bumpDataVersion()` triggers the refetch. This is self-correcting and
consistent with the app's existing post-mount async read model.

### FX — one argument to `frankfurterUrl`

`frankfurterUrl(currencies, date?)` swaps `/v1/latest` for `/v1/${date}`. The response shape is
identical, so `parseEcbResponse`, `withFee`, and `toThb` are untouched.

Per pending post:

1. `rule.rate` set → use it (pinned; no network).
2. Currency is THB/null → no conversion.
3. Otherwise fetch the ECB fixing for **the due date**, `withFee(rate, feePct)`, `toThb(...)`.
   One fetch per distinct due date, cached within the sweep.
4. Fetch fails or offline → fall back to the cached rate in `settings` and post anyway.

`currency` + `originalAmount` are stored as on any foreign entry, so a fallback-rate row stays
correctable by hand.

ECB publishes no weekend/holiday fixing; Frankfurter answers those dates with the previous fixing.
That is the desired behaviour, not an error case.

### Backup and restore

`importBackupAction` is replace-all and the CSV carries no rule id, so after restore the ledger and
the rules are strangers. After `restoreEntries` succeeds:

```
maxDateInCsv = max(entry.date for entry in parsed entries)   -- from parseMonefyCsv's output
rewindRecurrences(db, maxDateInCsv)
  → last_posted = min(last_posted, maxDateInCsv) for every rule
```

`maxDateInCsv` comes from the already-parsed entries, not a second pass over the text.
`importBackupAction` throws on an empty parse before `restoreEntries` runs, so the max is always
defined by the time the rewind executes.

The next sweep refills from there to today. Restoring a June 20 backup reposts July's rent, Netflix,
and installments. Because `seq` derives from `last_posted`, the payment numbers come back correct
with no extra work — the payoff of the single-pointer design.

Clamping to the CSV's newest date is correct in both directions: entries at or before it are already
in the restored ledger and must not repost; the CSV holds nothing after it, so everything after must.

### The page — `/recurring`

A route in the More sheet, alongside budgets/categories/accounts. `'use client'`, reads via
`use-recurring.ts`, writes via `actions.ts` (each ending in `bumpDataVersion()`).

```
Committed  ฿17,364 / month
─────────────────────────────
🎬 Netflix     $9.99 · 5th      ~฿364
🧊 Fridge      ฿2,000 · 1st     4 of 12 paid · 9 left
🏠 Rent        ฿15,000 · 1st
```

The header total normalises yearly rules to a monthly figure (`amount / 12`) and FX rules at the
current rate — it is a glance figure, so `formatBahtWhole`. Add / edit / archive a rule. Archive
rather than delete, so posted history stays explainable.

## Testing

Pure schedule math (`schedule.test.ts`) carries the weight:

- 31st rule → Feb 28, and Feb 29 in a leap year
- `interval_months` 12 steps a year, anchored to `startDate`'s month
- installment stops at `totalCount`; `startSeq = 4, totalCount = 12` yields exactly 9 posts
- catch-up across several months returns every due date in order
- never posts before `startDate`
- `lastPosted = today` → empty (idempotence)

Sweep tests against the Node shim: posts the right entries with the right signs and notes, advances
`last_posted`, a second sweep is a no-op, a rule with a pinned rate skips the fetch, a failed fetch
still posts at the cached rate.

`rewindRecurrences` test: clamps only rules ahead of the CSV date, leaves earlier ones alone, and a
subsequent sweep refills with correct seq numbers.

`frankfurterUrl` test: with and without a date.

Per CLAUDE.md, tests prove the queries and never the worker or OPFS — so the DDL lockstep and the
sweep-on-open behaviour must additionally be **driven in a real browser at 412px** before this is
done.

## Known ceilings

- **`(4/12)` is a string the sweep writes into the note.** Hand-editing that note does not re-sync
  anything. Accepted: it keeps `entries` unchanged and the counter visible in Records and the CSV.
- **The ledger is only as current as the last app open.** Inherent to having no server. Two months
  away → two months of rows appear at once, dated correctly.
- **A cancelled subscription keeps posting** until the rule is archived. Accepted with auto-post; the
  recurring page is where you notice.
- **The header's monthly total values FX rules at today's rate**, so it drifts from what actually
  posted. It is a glance figure by design.
