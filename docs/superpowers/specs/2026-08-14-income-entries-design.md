# Income entries — design

**Date:** 2026-08-14
**Branch:** `feat/income-entries`

## The event being modelled

Dinner costs ฿2,000. A friend hands over ฿500 in cash for their share. The whole ฿2,000 goes on
the credit card.

Today moniflow can only express this by recording ฿1,500 on the card — which is correct for the
spending story but wrong in two ways the user cares about:

1. The credit card statement says ฿2,000. The app says ฿1,500. Reconciling the bill fails.
2. Standing at the till you have to do `2000 − 500` in your head before you can key anything.

Recording what actually happened is two rows:

| date | account | category | amount |
| --- | --- | --- | --- |
| 2026-08-14 | บัตรเครดิต | ค่าอาหาร | −2,000 |
| 2026-08-14 | เงินสด | ค่าอาหาร | +500 |

## Scope

**In scope:** small refunds — someone paying back their share. Money that comes back against
spending that already happened.

**Out of scope:** salary, bonuses, any large standalone inflow. The model below deliberately cannot
carry them: ฿30,000 landing on one category would drive that category net-positive and it would
simply vanish from the donut. If salary is ever tracked, that is a separate feature with its own
income-side categories.

**Also out of scope:** account balances. `accounts/page.tsx` shows *"This cycle's spending per
account"* — there is no balance concept anywhere in the app and this feature does not add one.
Recording +฿500 to เงินสด still does not tell you what is in your wallet; that needs opening
balances.

## Decision: income is negative spend

Income is entered against **the same category as the expense it refunds** (฿500 → ค่าอาหาร). There
is no income-side category, no `is_income` flag, no separate cashflow surface.

Every summed figure nets automatically. Rejected alternative: a separate income category set that
only reduces the cycle total, leaving the donut gross. That needs a new `categories` column (an OPFS
column migration), a filter at every spend surface, and it puts two different totals on Home at once
(donut ฿12,000 / budget meter ฿11,500) — the exact defect v1.10.2 shipped and v1.10.3 had to fix.

## 1. Data model — no migration

`entries.amount` is already a signed `real`, and the schema comment has always read *"one row per
inflow/outflow"*. `parseEntryForm` already reads a `direction` field and flips the sign
(`entry-form.ts:33,59`); `EntryForm.tsx` already renders the Expense/Income radio — it is just only
wired to `/entries/edit`.

**No change to `schema.ts`, no change to `BOOTSTRAP_SQL` in `db/worker.ts`, no
`COLUMN_MIGRATIONS` entry.** This is what makes the feature cheap relative to the off-budget round.

## 2. The netting rule

`Math.abs` is used throughout the codebase to turn a stored-negative amount into a magnitude. Once
inflows exist that is the wrong operator, because it maps +500 to 500 rather than to −500 — an
income row silently counts as spending of the same size.

The correction is mechanical:

```
Math.abs(x) whose result is ACCUMULATED  →  -x
Math.abs(x) used as a SORT KEY or to display ONE ROW  →  unchanged
```

Negation is correct on both signs: an expense of −2,000 becomes +2,000, an income of +500 becomes
−500, and they sum to 1,500.

**Change to `-x`:**

| file | lines |
| --- | --- |
| `features/entries/off-budget.ts` | 30, 47 |
| `features/entries/by-weekday.ts` | 31 |
| `features/entries/by-note.ts` | 16 |
| `features/entries/year.ts` | 34 |
| `features/entries/heatmap.ts` | 25 |
| `features/entries/donut.ts` | 58 |
| `features/entries/breakdown.ts` | 13, 14, 17, 18 |
| `features/entries/breakdown-matrix.ts` | 33 |
| `features/entries/use-analytics.ts` | 141, 194 |
| `app/accounts/page.tsx` | 63 |

**Make sign-aware** — these display a *group total*, which can now be net-positive, and
`formatBaht(Math.abs(total))` would print a refund as if it were spending. Use the signed formatter
(`shared/money.ts:57`): `records/page.tsx:216` (the filtered-set total) and `records/page.tsx:279`
(the day-section total).

Already correct, no change: `use-records.ts:164,176`, `by-date.ts:18` and `by-spend.ts:28` sum
`e.amount` signed and net on their own.

**Leave alone** (sort keys and single-row displays): `top-transactions.ts:12`, `by-spend.ts:31`,
`delta-breakdown.ts:27`, `queries.ts:178,475`, `use-records.ts:163`, `SwipeRow.tsx:148`,
`TopTransactionsList.tsx:51,67`, `Keypad.tsx:122,133`, `EntryForm.tsx:142,158`,
`year/page.tsx:165,183`, `budget-status.ts:65`, `month/page.tsx:158,159`, `CycleDeltaCard.tsx:58,84`.

### Read filters

`getEntriesInRange` and `getCategoryBreakdown` (`queries.ts:122,175`) drop their
`lt(entries.amount, 0)` clause so inflows reach the aggregations. Their header comment — which
currently states the expenses-only invariant as a rule — is rewritten to state the netting rule
instead.

`hasAnyExpense` (`queries.ts:138`) and `getFirstExpenseDate` (`queries.ts:152`) **keep** the filter:
a ledger holding only inflows has no spending history, and an ancient refund must not open an empty
year on `/year`'s stepper.

`searchEntries` (`queries.ts:381`) and `getEntriesByCategory` (`queries.ts:391`) drop the filter —
a refund must be findable in Records and must appear when drilling into its category.

### A category that goes net-positive

Possible when a refund lands in a cycle after the spend it refunds. `donut.ts:59` already carries
`.filter((s) => s.value > 0)`, so a negated net-positive category yields a negative value and falls
out of the ring with no new code. The budget meter still carries the true negative, so the two
disagree by exactly the amount that could not be drawn. Mark this with a `ponytail:` comment naming
the ceiling — a ring cannot draw a negative wedge, and a "credit" wedge would be a bigger lie than
an absent one.

## 3. Entry surface — the Keypad

`parseEntryForm` already accepts `direction`, and the Keypad already carries hidden fields for
exactly this kind of state (`Keypad.tsx:207,213`). One more:

```tsx
<input type="hidden" name="direction" value={income ? 'income' : 'expense'} />
```

**Placement:** a quiet toggle on the same row as "Exclude from budget" (`Keypad.tsx:414`), not a
chip in the top date/currency/account row. This happens a few times a month; the top row is read
every day and has already been trimmed once because "Choose category" was falling below the fold on
a 412px frame.

**Mis-tap protection:** with income on, the amount display reads `+฿500` in `--color-gain`.
`SwipeRow.tsx:150-151` already renders positive amounts that way, so the two surfaces agree.

`/entries/edit` needs nothing — `EntryForm`'s radio and `use-edit-entry.ts` already round-trip the
sign.

## 4. Backup round-trip

moniflow's own backup format is Monefy CSV, so `restore.ts:48` and the legacy Monefy import
(`actions.ts:117`) share one parser with opposite needs:

- **Monefy import** must keep dropping inflows. A real Monefy export carries income-only categories
  (salary, transfers-in) that would pollute the ledger and desync the `/categories` counts.
- **moniflow restore** must keep them, or every restore silently deletes income — the same defect
  class as the `off_budget` loss fixed in v1.8.1, which only bit on a fresh device, i.e. the one
  situation a backup exists for.

```ts
export function parseMonefyCsv(text: string, opts?: { keepInflows?: boolean }): ImportResult
```

Default `false`, so the legacy Monefy path is byte-for-byte unchanged. `restore.ts` passes `true`.
`serializeMonefyCsv` needs no change — it writes the stored amount, so the sign survives already.

## 5. Untouched

- The donut stays all-in; the budget meter, pace and safe-to-spend stay discretionary. The
  three-tier off-budget rule in `off-budget.ts:10` is unchanged — only its accumulation operator is.
- `topTransactions` stays expenses-only. "Biggest transaction this cycle" must not be a refund.
- `anomaly.ts` — no change needed. It consumes the cycle matrix, not raw rows, and already skips
  non-positive totals (`current <= 0`, `v > 0`), so a net-positive category drops out of both the
  subject and the basis on its own once the matrix nets.
- `trips.ts` — **no change**, correcting an earlier draft of this spec that listed lines 45/46/71.
  Trips are already inflow-aware and already chose gross on purpose: `getForeignEntries` and
  `getTripEntries` carry no amount filter (`queries.ts:401,407-408` — *"trips count every foreign
  row, refunds included"*) and `trips.ts:28-29` states *"a trip answers 'how much moved', not 'net
  flow', so a refund/credit row still adds to the total"*. That is a live documented decision, not
  an oversight from the expenses-only era, and this feature does not need it reversed — refunds in
  scope here are domestic THB, and a foreign row never reaches these functions.
- Recurring rules, budgets, trips naming, currency catalog: no change.

## 6. Tests

TDD — each must fail before the corresponding change.

| file | assertion |
| --- | --- |
| `off-budget.test.ts` | −2,000 and +500 in one category → `discretionary` is 1,500, not 2,500 |
| `donut.test.ts` | a net-positive category is absent from the slices, not drawn as a positive wedge |
| `breakdown.test.ts` | `share`/`pct` computed off net totals; a net-positive row does not distort the set |
| `import.test.ts` | `keepInflows` unset drops inflows (Monefy), `true` keeps them (restore) |
| `settings/restore` round-trip | a ledger containing an inflow survives export → restore. Must be able to fail — the currency-catalog round produced three tests that could not. |
| `entry-form.test.ts` | already covers `direction=income` → positive amount; extend for the Keypad's hidden field |
| `use-home.test.ts` | today's allowance rises when a refund is recorded. Pin the date per `describe` — `todayIso`'s `vi.mock` leaks across tests in this file. |

## Verification

Tests run against the Node shim and prove none of the worker, OPFS or layout. Before this is done:
drive it at 412px in a browser — record an expense, record a refund against the same category, and
confirm the donut wedge, the budget meter and Today's allowance all move by the refund and agree
with each other.
