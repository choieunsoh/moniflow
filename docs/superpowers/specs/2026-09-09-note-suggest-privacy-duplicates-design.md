# Three small ones: a note that remembers, numbers that hide, and rows that shouldn't be there

Date: 2026-09-09
Branch: `feat/note-suggest-privacy-duplicates`
Status: approved, ready for planning

## Why

Three independent gaps, chosen together because none of them needs a schema change and none of them
touches the others' files (except the Settings page, which gains one row each from two of them).

1. **The keypad forgets.** `useNewEntry` already loads every past note into a `<datalist>`, so the
   note field autocompletes. But the ledger also knows which category and account that note has
   always gone to, and the keypad throws that away — you retype "ข้าวเที่ยง", tap Next, then hunt
   the same category tile you have picked for it ninety times.
2. **Every figure is public.** There is no auth (deliberately — a static export has no server to
   enforce one), and the app is a phone-shaped column of large money. Someone beside you on the BTS
   reads the whole thing.
3. **Three writers, no duplicate check.** Rows enter the ledger from the keypad, from a Monefy CSV
   import, and from the recurring sweep on app open. Nothing anywhere notices when two of them land
   on the same spend, and the ledger is 10,702 rows deep.

## What this does NOT do

- No new table, no new column, no `COLUMN_MIGRATIONS` entry. The one piece of new state is a
  `settings` row, and `settings` is key/value — a new key is free and rides the backup automatically
  because the catalog dumps every row.
- No hour-of-day anything. The `time` column has never held a value.
- No "this pair is not a duplicate" memory. That needs stored state; add it only if the scan proves
  noisy in practice.
- The share card is NOT blurred. It is a file you deliberately export.

---

## 1. The note suggests its usual category and account

### Mechanism

A new query, `getNoteSuggestions(db)`, groups the ledger by note plus category plus account:

```sql
SELECT note, category_id, account_id, COUNT(*) AS n, MAX(date) AS last
FROM entries
WHERE note IS NOT NULL AND note <> ''
GROUP BY note, category_id, account_id
```

It is fetched ONCE, inside the existing `Promise.all` in `useNewEntry`, alongside `getDistinctNotes`.
Nothing queries on keystroke. The result is small (distinct notes, not rows) and the page already
pays for a dozen parallel reads at this point.

Selection is a pure function in `src/features/entries/note-suggest.ts`:

```ts
export function pickNoteSuggestion(
  rows: NoteSuggestionRow[],
  note: string,
): { category: string; account: string } | null;
```

- Match is EXACT on the trimmed, case-folded note. Not prefix, not contains. A suggestion that fires
  on a partial word would change under you mid-typing, and the chip's whole value is that it is
  predictable enough to tap without reading.
- Winner is the highest `n`. Ties break on the later `last`, so a category you have recently moved a
  note to wins over an equal count of older rows.
- Empty or unmatched note returns `null`, and the chip is simply absent.

### UI

One chip below the note input on the amount view, reading `<icon> <category> · <account>` with a
short "Save" affordance. It appears only when the note matches AND the keypad's existing `canSubmit`
is true (a non-zero amount). Tapping it submits through the SAME path the category grid uses, with
the category and account passed in rather than tapped. The category grid stays exactly as it is; the
chip is a shortcut past it, not a replacement.

Everything else on the keypad is unchanged and still wins: the currency selection, the off-budget
toggle, and the off-budget default the chosen category carries. The chip supplies two values, not a
whole entry.

The chip must not appear in copy mode (`isCopy`) — a duplicated row already carries its own category
and account, and a second competing answer on the same screen is noise.

### Tests

- `note-suggest.test.ts`: exact-match only; frequency wins; recency breaks a tie; empty and unmatched
  return null; case and surrounding whitespace are folded.
- `queries.test.ts`: `getNoteSuggestions` shapes rows correctly and excludes null/empty notes.
- `Keypad.test.tsx`: chip renders on a matching note, is absent on a non-matching one, is absent at
  a zero amount, is absent in copy mode, and submits with the suggested category and account.

---

## 2. Privacy: blur the money, hold to read

### State, and why it copies the theme exactly

A `privacy` key in `settings`, values `'on'` | `'off'`, default `'off'`. It is stamped onto `<html>`
as `data-privacy="on"` by a hook in `AppShell`, mirroring `useTheme` — including writing a
`moniflow_privacy` localStorage cache that the pre-paint inline script in `layout.tsx` reads.

**The pre-paint stamp is the whole feature, not an optimisation.** Reads are async and post-mount:
if the attribute only lands after the OPFS round-trip, every app open paints your real balance for a
few hundred milliseconds before hiding it. A privacy mode with a flash of the truth is not a privacy
mode. One line joins the existing script:

```js
var p = localStorage.getItem('moniflow_privacy');
if (p === 'on') d.dataset.privacy = 'on';
```

Following `useTheme`'s convention, the default REMOVES the attribute rather than stamping `'off'`.

### What gets blurred

A `<Money>` component in `src/shared/ui/`, wrapping the output of the money formatters at every
`.tsx` call site (89 of them across 24 files):

```tsx
<Money>{formatBaht(total)}</Money>
```

It renders a plain `<span className="money">`. It takes no props beyond children — no variant, no
size — because the surrounding element already owns the typography.

Both chart components (`DonutChart`, `TrendChart`) carry the same class on their root element.
ECharts bakes its labels into a canvas where `<Money>` cannot reach, so the whole chart blurs as one
image. That loses the shape of the data along with the figures while privacy is on; that is the
accepted trade, and it is why peek (below) is global rather than per-element.

`aria-label` strings and chart option-builders in `.ts` are untouched. They are not visible, and a
screen-reader user reading their own ledger aloud is not the threat being addressed.

### Peek

CSS:

```css
[data-privacy='on'] .money {
  filter: blur(0.3em);
  transition: filter 120ms;
}
[data-privacy='on'][data-peek] .money {
  filter: none;
}
```

One delegated `pointerdown` listener on the app frame sets `data-peek` when the press lands inside a
`.money`; `pointerup`, `pointercancel`, and losing the pointer clear it. Press and hold any figure,
read everything, let go.

Two reasons it is JS and not `:active` alone: iOS Safari does not fire `:active` on non-interactive
elements without a touch handler in the chain, and `DonutChart`'s root is `pointer-events-none` (so
a swipe passes through to the cycle-swipe wrapper), which means the chart can never be the element
you press. Peek is therefore GLOBAL — holding any figure anywhere reveals the charts too.

### The toggle

Settings only, beside the other appearance controls. This is a preference you set once and leave on,
not a panic button, and every alternative home for it was worse: the More sheet is a grid of
navigation links, and the header action slot is already spoken for per-page.

### Keeping it honest

`money.test.ts` already scans `src/**` for a banned formatter shape. Add a scan in the same file:
every `.tsx` outside `Money.tsx` that renders a `formatBaht*` / `formatSignedBaht` /
`formatLedgerSpend` result into JSX must wrap it in `<Money>`. Without it a new call site added in
six months leaks silently, and nothing in the type system notices — `<Money>` and a bare string
render identically.

### Tests

- `Money.test.tsx`: renders its children inside `.money`.
- `use-privacy.test.ts`: stamps and removes the attribute, writes the localStorage cache, re-runs on
  a data-version bump (the same shape as `use-theme.test.ts`).
- `layout.test.ts`: the pre-paint script contains the privacy branch.
- `money.test.ts`: the unwrapped-formatter scan.
- Peek is a browser check, not a jsdom one.

---

## 3. Duplicate detector

### Rule

Two rows are duplicates when they share a date, an amount, and a category. Account is deliberately
NOT part of the key: paying the same bill twice from two different cards is exactly the mistake
worth catching. Nor is there a date window — a ±1 day rule would flag the genuinely common case of
buying the same coffee two mornings running, and a false positive in a tool whose only affordance is
Delete is worse than a miss.

Pure function in `src/features/entries/duplicates.ts`:

```ts
export function findDuplicateGroups(rows: EntryRow[]): EntryRow[][];
```

Keys on `date|amount|categoryId`, returns only groups of two or more, each group sorted by id so the
original comes first and the suspect second. Groups are ordered newest date first.

### UI

A section on the Settings page, under a button that runs the scan on demand — not on mount, because
it reads the whole ledger through the existing `getEntries` (the same read the backup export already
performs) and nobody needs that on every Settings visit.

Each group renders its rows with date, category, account, note, and amount. Each row gets a Delete
button. Deleting goes through the existing `deleteEntryAction`, which returns its own row snapshot,
so the Undo toast shipped in v1.22.0 comes along for free. A group with one row left drops out of
the list on the next scan.

An empty result states "No duplicates found" rather than rendering nothing.

### Tests

- `duplicates.test.ts`: groups an exact triple; groups two rows that differ ONLY by account;
  separates rows differing in date, amount, or category; returns `[]` for a clean ledger; preserves
  id order within a group.
- A `.test.tsx` for the Settings section: the scan renders groups, delete calls the action, the
  empty state renders.

---

## Commit plan

One branch, three topic commits, in this order:

1. `feat(features): let a note answer with the category it always takes` — the suggestion chip.
2. `feat(shared): hide the money until you hold it` — `<Money>`, the 89 call sites, the two charts,
   the pre-paint line, the Settings toggle, the scan test.
3. `feat(features): find the rows that were entered twice` — the duplicate detector.

Commit 2 is by far the largest diff and touches the most files, but it is mechanical. It must not be
split across commits: a half-wrapped app is a privacy mode that leaks, and the scan test would be
red in between.

## Verification

The suite runs under jsdom against the Node shim and proves none of the three in a browser. Before
merge, at 412px in a real browser: the chip saves a real entry with the right category and account;
privacy survives a hard reload with no flash of figures on first paint; press-and-hold reveals and
release re-hides, including over the donut; the scan finds a duplicate deliberately created with a
฿1 row and the Undo restores it.
