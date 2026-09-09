# Note Suggestion, Privacy Blur, and Duplicate Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independent moniflow features — a keypad chip that saves an entry under the category and account a note has always taken, a privacy mode that blurs every rendered figure until you press and hold one, and an on-demand duplicate scan over the ledger.

**Architecture:** All three are additive reads over the existing `entries` and `settings` tables. Two pure functions (`pickNoteSuggestion`, `findDuplicateGroups`) hold the logic and are unit-tested without React or a database; one new query feeds the first; the privacy mode copies `useTheme`'s two-layer stamp (OPFS is the source of truth, localStorage is the pre-paint cache, a `data-` attribute on `<html>` drives CSS) exactly.

**Tech Stack:** TypeScript 5.9 strict (ESM, extensionless relative imports), React 19, Next.js 16 App Router with `output: 'export'`, drizzle-orm query builder over a sqlite-proxy `Db`, Tailwind CSS v4, Vitest + Testing Library under jsdom.

Spec: `docs/superpowers/specs/2026-09-09-note-suggest-privacy-duplicates-design.md`
Branch: `feat/note-suggest-privacy-duplicates` (already created; the spec is committed on it at `3822bb5`)

## Global Constraints

- **No `any`, no `as` casts, no `!` assertions, no `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`.** These are ESLint **errors** in this repo, not warnings. Narrow with a type guard or a `flatMap` over a nullable, the way `getDistinctNotes` already does.
- **`type` aliases, never `interface`.** `as const` is allowed and encouraged; `satisfies` where a known contract exists.
- **`for..of`, never `.forEach`.**
- **No schema change of any kind.** No new table, no new column, no `COLUMN_MIGRATIONS` entry, no edit to `BOOTSTRAP_SQL` in `src/db/worker.ts`. The only new stored state is one row in the existing key/value `settings` table, which rides the backup automatically because `getAllSettings` dumps every row.
- **Every read hook's effect goes through `withDb` from `@shared/db-effect`.** Never a bare `void (async () => { const db = await getBrowserDb(); … })()`.
- **Every write in an `actions.ts` ends with `bumpDataVersion()`** so live read hooks refetch.
- **Money formatter provenance is fixed** and this plan does not change which formatter any call site uses. `formatBaht` for a stored/computed figure, `formatBahtKeyed` for a figure being typed, `formatBahtWhole` for glance figures, `formatLedgerSpend` for a ledger row or a sum of ledger rows, `formatSignedBaht` where direction is the point. Wrapping in `<Money>` must not swap one for another.
- **Quality gates before every commit**, run separately so failures surface individually:
  ```bash
  npm run format:files <the files you changed>
  npm run typecheck
  npm run lint
  npm run format:check
  npm test
  ```
- **Commit with repeated `-m` flags.** Never `git commit -F <file>` and never a heredoc — the wrapped `git` on this machine never receives stdin and the commit-msg hook rejects an empty message. Format is `type(scope): description` with scopes `db` / `app` / `features` / `shared`. Do NOT add a `Co-Authored-By:` or `Claude-Session:` trailer; a global hook strips both by design, so a trailer you pass is silently absent and must not be re-added or verified.
- **Shell is Git Bash (POSIX).** Not PowerShell, not `cmd /c`.
- **Charts bake token values into a canvas.** Nothing in this plan changes a chart option-builder, so no chart needs a new `useResolvedTheme` dependency.

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `src/features/entries/note-suggest.ts` | `pickNoteSuggestion` — pure winner-selection over grouped note rows |
| `src/features/entries/note-suggest.test.ts` | its unit tests |
| `src/features/entries/duplicates.ts` | `findDuplicateGroups` — pure grouping of same-day/same-amount/same-category rows |
| `src/features/entries/duplicates.test.ts` | its unit tests |
| `src/features/entries/ui/DuplicateScan.tsx` | the Settings-page scan surface (button, groups, per-row delete) |
| `src/features/entries/ui/DuplicateScan.test.tsx` | its render/interaction tests |
| `src/shared/ui/Money.tsx` | `<Money>` — the one span every rendered figure passes through |
| `src/shared/ui/Money.test.tsx` | its render test |
| `src/features/settings/use-privacy.ts` | stamps `data-privacy` on `<html>`, keeps the localStorage cache, installs the peek listener |
| `src/features/settings/use-privacy.test.ts` | its tests |
| `src/features/settings/ui/PrivacyToggle.tsx` | the Off/On control in Settings → Appearance |
| `src/features/settings/ui/PrivacyToggle.test.tsx` | its tests |

**Modified:**

| File | Change |
| --- | --- |
| `src/features/entries/queries.ts` | `+ getNoteSuggestions`, `+ type NoteSuggestionRow` |
| `src/features/entries/use-new-entry.ts` | fetch note suggestions alongside `getDistinctNotes` |
| `src/features/entries/ui/Keypad.tsx` | controlled note state, suggestion-aware `effectiveAccount`, the save chip |
| `src/app/entries/new/page.tsx` | pass the new `noteSuggestions` prop (the edit route stays untouched) |
| `src/features/settings/theme.ts` | `+ PRIVACY_STORAGE_KEY`, `PRIVACIES`, `Privacy`, `DEFAULT_PRIVACY`, `isPrivacy`, `readPrivacy` |
| `src/features/settings/queries.ts` | `+ getPrivacy`, `+ setPrivacy` |
| `src/features/settings/actions.ts` | `+ setPrivacyAction` |
| `src/shared/ui/AppShell.tsx` | call `usePrivacy()` beside `useTheme()` |
| `src/app/layout.tsx` | one more branch in the pre-paint inline script |
| `src/app/globals.css` | the `.money` blur + peek rules |
| `src/app/settings/page.tsx` | `<PrivacyToggle />` in Appearance; a Duplicates section |
| 24 `.tsx` files rendering money | wrap every figure in `<Money>` |
| `src/features/entries/ui/DonutChart.tsx`, `TrendChart.tsx` | `money` class on the chart root |
| `src/shared/money.test.ts` | `+` the unwrapped-figure scan |
| `src/app/layout.test.ts` | `+` assert the privacy branch is inlined |

**Task order deliberately differs from the spec's commit plan.** The spec proposed one commit for all of privacy. This plan lands `<Money>` and the wrapping BEFORE the setting that turns blurring on, so no commit in history contains a privacy mode that half-works, and every commit is green on its own. Same end state, three smaller reviewable steps.

---

## Task 1: `pickNoteSuggestion`

**Files:**

- Create: `src/features/entries/note-suggest.ts`
- Test: `src/features/entries/note-suggest.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `type NoteSuggestion = { category: string; account: string }` and `pickNoteSuggestion(rows: NoteSuggestionRow[], note: string): NoteSuggestion | null`. `NoteSuggestionRow` is defined in Task 2 in `queries.ts` as `{ note: string; category: string; account: string; count: number; last: string }` — Task 1 imports the type from `./queries` (the same direction `refunded-summary.ts` already imports `Breakdown`). Write Task 2's type export first if you are doing these out of order.

- [ ] **Step 1: Add the type to `queries.ts` so Task 1 can import it**

Append near the other exported row types in `src/features/entries/queries.ts` (the implementation of the query itself lands in Task 2):

```ts
// One row per (note, category, account) combination the ledger has ever seen, with how often and
// how recently. Feeds pickNoteSuggestion — see note-suggest.ts for the selection rule.
export type NoteSuggestionRow = {
  note: string;
  category: string;
  account: string;
  count: number;
  last: string; // YYYY-MM-DD, the most recent entry in this combination
};
```

- [ ] **Step 2: Write the failing test**

Create `src/features/entries/note-suggest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickNoteSuggestion } from './note-suggest';
import type { NoteSuggestionRow } from './queries';

function row(over: Partial<NoteSuggestionRow> = {}): NoteSuggestionRow {
  return { note: 'ข้าวเที่ยง', category: 'อาหาร', account: 'เงินสด', count: 1, last: '2026-01-01', ...over };
}

describe('pickNoteSuggestion', () => {
  it('returns null for an empty note', () => {
    expect(pickNoteSuggestion([row()], '')).toBeNull();
    expect(pickNoteSuggestion([row()], '   ')).toBeNull();
  });

  it('returns null when no stored note matches', () => {
    expect(pickNoteSuggestion([row()], 'กาแฟ')).toBeNull();
  });

  it('matches exactly, not by prefix or substring', () => {
    expect(pickNoteSuggestion([row({ note: 'ข้าวเที่ยงวันศุกร์' })], 'ข้าวเที่ยง')).toBeNull();
    expect(pickNoteSuggestion([row({ note: 'ข้าว' })], 'ข้าวเที่ยง')).toBeNull();
  });

  it('folds case and surrounding whitespace on both sides', () => {
    const found = pickNoteSuggestion([row({ note: '  Starbucks ' })], 'starbucks');
    expect(found).toEqual({ category: 'อาหาร', account: 'เงินสด' });
  });

  it('picks the most frequent combination', () => {
    const rows = [
      row({ category: 'อาหาร', count: 9 }),
      row({ category: 'ช็อปปิ้ง', count: 40 }),
      row({ category: 'กาแฟ', count: 2 }),
    ];
    expect(pickNoteSuggestion(rows, 'ข้าวเที่ยง')?.category).toBe('ช็อปปิ้ง');
  });

  it('breaks a tie on the more recent combination', () => {
    const rows = [
      row({ category: 'อาหาร', count: 5, last: '2024-03-01' }),
      row({ category: 'กาแฟ', count: 5, last: '2026-08-30' }),
    ];
    expect(pickNoteSuggestion(rows, 'ข้าวเที่ยง')?.category).toBe('กาแฟ');
  });

  it('carries the account of the winning combination, not of another row', () => {
    const rows = [
      row({ category: 'อาหาร', account: 'เงินสด', count: 1 }),
      row({ category: 'กาแฟ', account: 'บัตรเครดิต', count: 7 }),
    ];
    expect(pickNoteSuggestion(rows, 'ข้าวเที่ยง')).toEqual({
      category: 'กาแฟ',
      account: 'บัตรเครดิต',
    });
  });

  it('ignores rows for other notes entirely', () => {
    const rows = [row({ note: 'กาแฟ', category: 'กาแฟ', count: 99 }), row({ count: 1 })];
    expect(pickNoteSuggestion(rows, 'ข้าวเที่ยง')?.category).toBe('อาหาร');
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm test -- src/features/entries/note-suggest.test.ts`
Expected: FAIL — cannot resolve `./note-suggest`.

- [ ] **Step 4: Write the implementation**

Create `src/features/entries/note-suggest.ts`:

```ts
import type { NoteSuggestionRow } from './queries';

export type NoteSuggestion = { category: string; account: string };

// The category and account a given note has always taken, or null when the ledger has nothing to
// say about it.
//
// The match is EXACT on the trimmed, case-folded note — not a prefix and not a substring. A
// suggestion that fired on a partial word would change under you as you typed, and the whole value
// of the chip this feeds is that it is stable enough to tap without reading it first.
//
// Frequency wins; a tie goes to the more recent combination, so a category you have recently moved
// a note to beats an equal count of older rows rather than being stuck behind history.
export function pickNoteSuggestion(
  rows: NoteSuggestionRow[],
  note: string,
): NoteSuggestion | null {
  const key = note.trim().toLowerCase();
  if (key === '') return null;

  let best: NoteSuggestionRow | null = null;
  for (const row of rows) {
    if (row.note.trim().toLowerCase() !== key) continue;
    if (best === null || row.count > best.count || (row.count === best.count && row.last > best.last)) {
      best = row;
    }
  }
  return best === null ? null : { category: best.category, account: best.account };
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test -- src/features/entries/note-suggest.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Gates**

```bash
npm run format:files src/features/entries/note-suggest.ts src/features/entries/note-suggest.test.ts src/features/entries/queries.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

Do NOT commit yet — Task 2 completes the same deliverable.

---

## Task 2: `getNoteSuggestions`

**Files:**

- Modify: `src/features/entries/queries.ts` (add the query beside `getDistinctNotes`, around line 232)
- Test: `src/features/entries/queries.test.ts`

**Interfaces:**

- Consumes: `NoteSuggestionRow` from Task 1 Step 1.
- Produces: `getNoteSuggestions(db: Db): Promise<NoteSuggestionRow[]>`.

- [ ] **Step 1: Write the failing test**

Add to `src/features/entries/queries.test.ts` — and add `getNoteSuggestions` to the existing import list from `./queries` at the top of that file:

```ts
describe('getNoteSuggestions', () => {
  it('groups by note, category and account with a count and the latest date', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await addEntries(db, [
      { date: '2026-01-01', account: 'เงินสด', category: 'อาหาร', amount: -50, note: 'ข้าวเที่ยง' },
      { date: '2026-02-01', account: 'เงินสด', category: 'อาหาร', amount: -60, note: 'ข้าวเที่ยง' },
      { date: '2026-03-01', account: 'บัตรเครดิต', category: 'กาแฟ', amount: -90, note: 'ข้าวเที่ยง' },
    ]);

    const rows = await getNoteSuggestions(db);
    const lunch = rows.filter((r) => r.note === 'ข้าวเที่ยง');

    expect(lunch).toHaveLength(2);
    expect(lunch.find((r) => r.category === 'อาหาร')).toEqual({
      note: 'ข้าวเที่ยง',
      category: 'อาหาร',
      account: 'เงินสด',
      count: 2,
      last: '2026-02-01',
    });
  });

  it('excludes rows with no note and rows with a blank note', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await addEntries(db, [
      { date: '2026-01-01', account: 'เงินสด', category: 'อาหาร', amount: -50, note: null },
      { date: '2026-01-02', account: 'เงินสด', category: 'อาหาร', amount: -50, note: '' },
      { date: '2026-01-03', account: 'เงินสด', category: 'อาหาร', amount: -50, note: 'กาแฟ' },
    ]);

    expect(await getNoteSuggestions(db)).toEqual([
      { note: 'กาแฟ', category: 'อาหาร', account: 'เงินสด', count: 1, last: '2026-01-03' },
    ]);
  });

  it('returns an empty list for an empty ledger', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    expect(await getNoteSuggestions(db)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- src/features/entries/queries.test.ts -t getNoteSuggestions`
Expected: FAIL — `getNoteSuggestions is not a function` / no export.

- [ ] **Step 3: Write the implementation**

In `src/features/entries/queries.ts`, immediately after `getDistinctNotes`:

```ts
// Every (note, category, account) combination the ledger holds, with its count and latest date —
// the raw material for the keypad's note suggestion (see note-suggest.ts for the rule).
//
// Grouped in SQL and read ONCE per keypad mount, alongside getDistinctNotes; nothing here runs on a
// keystroke. The result is one row per combination, not per entry, so it stays small next to the
// ledger it summarises.
//
// innerJoin on both name tables: a row with no category or no account cannot answer the question
// this feeds, and the app enforces non-null on write anyway (the columns are nullable only because
// SQLite cannot ALTER to NOT NULL).
export async function getNoteSuggestions(db: Db): Promise<NoteSuggestionRow[]> {
  return (
    await db
      .select({
        note: entries.note,
        category: categories.name,
        account: accounts.name,
        count: sql<number>`count(*)`,
        last: sql<string>`max(${entries.date})`,
      })
      .from(entries)
      .innerJoin(categories, eq(entries.categoryId, categories.id))
      .innerJoin(accounts, eq(entries.accountId, accounts.id))
      .where(and(isNotNull(entries.note), ne(entries.note, '')))
      .groupBy(entries.note, entries.categoryId, entries.accountId)
      .all()
  ).flatMap((r) => (r.note === null ? [] : [{ ...r, note: r.note }]));
}
```

The `flatMap` is how the nullable `note` column narrows to `string` without a cast — the identical shape `getDistinctNotes` uses twenty lines above. `and`, `isNotNull`, `ne`, `eq`, `sql` are already imported in this file; add none.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- src/features/entries/queries.test.ts -t getNoteSuggestions`
Expected: PASS, 3 tests.

- [ ] **Step 5: Gates**

```bash
npm run format:files src/features/entries/queries.ts src/features/entries/queries.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

Do NOT commit yet — Task 3 completes the feature.

---

## Task 3: The keypad chip

**Files:**

- Modify: `src/features/entries/use-new-entry.ts`
- Modify: `src/features/entries/ui/Keypad.tsx`
- Modify: `src/app/entries/new/page.tsx` (pass the new prop)
- Test: `src/features/entries/ui/Keypad.test.tsx`, `src/features/entries/use-new-entry.test.ts`

**Interfaces:**

- Consumes: `pickNoteSuggestion` (Task 1), `getNoteSuggestions` and `NoteSuggestionRow` (Task 2).
- Produces: a `noteSuggestions: NoteSuggestionRow[]` field on `NewEntryData` and an OPTIONAL `noteSuggestions` prop on `Keypad`, defaulting to `[]`.

`use-edit-entry.ts` and the edit route are deliberately NOT touched. The chip is new-entry-only, so fetching suggestions for an edit would be a ledger-wide group-by run on every edit open for data nothing reads. The default makes that a non-change rather than a required prop passed as an empty array.

**Behaviour being built**, stated once so the steps below are unambiguous:

1. The note input becomes controlled React state (it is currently uncontrolled with `defaultValue`).
2. `suggestion = pickNoteSuggestion(noteSuggestions, note)`, recomputed on render. No memo: the list is one row per combination and the loop is trivial next to a keystroke.
3. The account the form posts follows the suggestion **only until you pick one yourself**. The `account` state initialiser changes from `entry?.account ?? defaultAccount` to `entry?.account ?? ''`, and the existing `effectiveAccount` derivation absorbs the suggestion. `''` already means "not chosen" in this component — the derivation and its comment exist at line 174 for exactly this reason.
4. A chip below the note input submits with the suggested category. It is a plain `type="submit"` button carrying `name="category"`, identical in mechanism to a category tile, so no new submit path exists.
5. The chip renders **only for a brand-new entry** (`entry === undefined`, which also excludes copy mode), only when a suggestion exists, only when that category is still in the picker's list, and only when `canSubmit` is true.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/entries/ui/Keypad.test.tsx`, following the render helper already in that file (reuse its existing `renderKeypad`-style setup and add `noteSuggestions` to the props it builds):

```ts
const SUGGESTIONS = [
  { note: 'ข้าวเที่ยง', category: 'อาหาร', account: 'บัตรเครดิต', count: 9, last: '2026-08-01' },
];
```

```tsx
describe('the note suggestion chip', () => {
  it('is absent before a matching note is typed', () => {
    renderKeypad({ noteSuggestions: SUGGESTIONS });
    keyAmount('100');
    expect(screen.queryByRole('button', { name: /อาหาร/ })).toBeNull();
  });

  it('appears once the note matches and an amount is keyed', async () => {
    renderKeypad({ noteSuggestions: SUGGESTIONS });
    keyAmount('100');
    await userEvent.type(screen.getByPlaceholderText('Note (optional)'), 'ข้าวเที่ยง');
    expect(screen.getByRole('button', { name: /อาหาร/ })).toBeVisible();
  });

  it('stays absent at a zero amount', async () => {
    renderKeypad({ noteSuggestions: SUGGESTIONS });
    await userEvent.type(screen.getByPlaceholderText('Note (optional)'), 'ข้าวเที่ยง');
    expect(screen.queryByRole('button', { name: /อาหาร/ })).toBeNull();
  });

  it('stays absent when duplicating an existing row', async () => {
    renderKeypad({ noteSuggestions: SUGGESTIONS, entry: anEntry({ note: 'ข้าวเที่ยง' }), isCopy: true });
    keyAmount('100');
    expect(screen.queryByRole('button', { name: /อาหาร/ })).toBeNull();
  });

  it('submits the suggested category and account', async () => {
    const action = vi.fn();
    renderKeypad({ noteSuggestions: SUGGESTIONS, action, defaultAccount: 'เงินสด' });
    keyAmount('100');
    await userEvent.type(screen.getByPlaceholderText('Note (optional)'), 'ข้าวเที่ยง');
    await userEvent.click(screen.getByRole('button', { name: /อาหาร/ }));

    const form = action.mock.calls[0][0];
    expect(form.get('category')).toBe('อาหาร');
    expect(form.get('account')).toBe('บัตรเครดิต');
  });

  it('an account you picked yourself beats the suggestion', async () => {
    const action = vi.fn();
    renderKeypad({ noteSuggestions: SUGGESTIONS, action, defaultAccount: 'เงินสด' });
    keyAmount('100');
    await userEvent.type(screen.getByPlaceholderText('Note (optional)'), 'ข้าวเที่ยง');
    await userEvent.click(screen.getByRole('button', { name: /^Account:/ }));
    await userEvent.click(screen.getByRole('button', { name: 'เงินสด' }));
    await userEvent.click(screen.getByRole('button', { name: /อาหาร/ }));

    expect(action.mock.calls[0][0].get('account')).toBe('เงินสด');
  });

  it('falls back to the default account when no note matches', async () => {
    const action = vi.fn();
    renderKeypad({ noteSuggestions: SUGGESTIONS, action, defaultAccount: 'เงินสด' });
    keyAmount('100');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: /กาแฟ/ }));

    expect(action.mock.calls[0][0].get('account')).toBe('เงินสด');
  });
});
```

Adjust the helper names (`renderKeypad`, `keyAmount`, `anEntry`, the "Next" button's accessible name) to whatever `Keypad.test.tsx` already uses — read the file first and match it rather than inventing a second harness.

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- src/features/entries/ui/Keypad.test.tsx`
Expected: FAIL — the chip does not exist; the account assertions post the default.

- [ ] **Step 3: Add the data to `use-new-entry.ts`**

In `src/features/entries/use-new-entry.ts`: import `getNoteSuggestions` from `./queries` and `type NoteSuggestionRow` alongside it; add `noteSuggestions: NoteSuggestionRow[]` to `NewEntryData` (directly under `notes`, with the comment `// note → its usual category/account, for the keypad's save chip`); add `getNoteSuggestions(db)` to the existing `Promise.all` array and `noteSuggestions` to the destructured names in the same position; add `noteSuggestions` to the `setData({ … })` object.

The array is positional — add the call and the name at the SAME index or every field silently shifts.

- [ ] **Step 4: Wire the Keypad**

In `src/features/entries/ui/Keypad.tsx`:

Add the imports:

```ts
import { pickNoteSuggestion } from '../note-suggest';
import type { NoteSuggestionRow } from '../queries';
```

Add `noteSuggestions` to both the destructured props (with its default) and the props type:

```ts
  // destructured, beside `isCopy = false`
  noteSuggestions = [],
```

```ts
  // in the props type, beside the other optionals
  // Only the new-entry route supplies these. An edit already carries its own category, so it pays
  // for no ledger group-by it will never read.
  noteSuggestions?: NoteSuggestionRow[];
```

Replace the account initialiser (currently `useState(entry?.account ?? defaultAccount)`):

```ts
  // '' means "not chosen yet" — see effectiveAccount below. A new entry starts unchosen so a note
  // suggestion can answer for it; an explicit tap in the account picker makes this non-empty and
  // wins from then on.
  const [account, setAccount] = useState(entry?.account ?? '');
```

Add note state beside it:

```ts
  const [note, setNote] = useState(entry?.note ?? '');
```

Add the suggestion derivation after `const category = entry?.category ?? '';`:

```ts
  // The category and account this note has always taken. Recomputed per render over a list that is
  // one row per combination, not per entry — cheap enough that memoising it would cost more to read
  // than it saves. Only offered for a brand-new entry: an edit and a duplicate both arrive carrying
  // their own category, and a second competing answer on the same screen is noise.
  const suggestion = entry === undefined ? pickNoteSuggestion(noteSuggestions, note) : null;
  const suggestedCategory =
    suggestion === null ? undefined : categories.find((c) => c.name === suggestion.category);
```

Replace `effectiveAccount` (line 174):

```ts
  const effectiveAccount =
    account !== '' ? account : (suggestion?.account ?? defaultAccount);
```

Make the note input controlled — replace `defaultValue={entry?.note ?? ''}` with:

```tsx
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
```

Add the chip immediately after the `</datalist>` that closes the note field:

```tsx
        {/* Saves in one tap under the category and account this exact note has always taken. It is
            an ordinary submit button carrying name="category" — the same mechanism as a category
            tile, so there is no second submit path to keep in step. Absent until the note matches
            and the amount is real, so it can never be the thing you tap by reflex on a blank form. */}
        {suggestion !== null && suggestedCategory !== undefined && canSubmit ? (
          <button
            type="submit"
            name="category"
            value={suggestion.category}
            onClick={() => buzz(18)}
            className="tap flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-sm"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
          >
            <CategoryIcon name={suggestedCategory.name} emoji={suggestedCategory.emoji} hue={suggestedCategory.hue} iconSet={iconSet} />
            <span className="min-w-0 truncate">
              {suggestion.category} · {suggestion.account}
            </span>
            <span className="ml-auto font-medium">Save</span>
          </button>
        ) : null}
```

Match `CategoryIcon`'s actual prop names to the call already in the category grid below — copy that call site's props rather than the ones written here, which are illustrative.

- [ ] **Step 5: Pass the prop from the new-entry route only**

In `src/app/entries/new/page.tsx`, add `noteSuggestions={data.noteSuggestions}` to the `<Keypad … />` call. Leave `src/app/entries/edit/page.tsx` and `use-edit-entry.ts` untouched: the prop is optional, the chip is guarded on `entry === undefined`, and an edit screen has nothing to gain from the query.

- [ ] **Step 6: Run the tests**

Run: `npm test -- src/features/entries/ui/Keypad.test.tsx src/features/entries/use-new-entry.test.ts`
Expected: PASS, including every pre-existing test in both files. If an existing test asserted the account posted for a new entry, confirm it still passes — the fallback chain preserves today's behaviour exactly when no suggestion matches.

- [ ] **Step 7: Gates and commit**

```bash
npm run format:files src/features/entries/note-suggest.ts src/features/entries/note-suggest.test.ts src/features/entries/queries.ts src/features/entries/queries.test.ts src/features/entries/use-new-entry.ts src/features/entries/ui/Keypad.tsx src/features/entries/ui/Keypad.test.tsx src/app/entries/new/page.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
```

```bash
git add -A
git commit -m "feat(features): let a note answer with the category it always takes" -m "The keypad already fed every past note into a datalist, but threw away what the ledger knows about where those notes go. A note that has been filed under the same category ninety times now offers a chip that saves under it in one tap, and the account follows the same answer until you pick one yourself." -m "The chip is an ordinary submit button carrying name=category, the same mechanism a category tile uses, so there is no second write path. The match is exact on the trimmed, case-folded note: a prefix match would change under you mid-typing, and a suggestion you cannot predict is one you have to read before tapping, which is the tap it was meant to save."
```

---

## Task 4: `<Money>` and the blur rules

**Files:**

- Create: `src/shared/ui/Money.tsx`, `src/shared/ui/Money.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Consumes: nothing.
- Produces: `Money({ children }: { children: ReactNode })`, rendering `<span className="money">`.

Nothing is blurred at the end of this task — no attribute is ever stamped until Task 6. That is deliberate: it keeps this commit and the next one green and inert.

- [ ] **Step 1: Write the failing test**

Create `src/shared/ui/Money.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Money } from './Money';

describe('Money', () => {
  it('renders its children inside a .money span', () => {
    render(<Money>฿228.00</Money>);
    const el = screen.getByText('฿228.00');
    expect(el.tagName).toBe('SPAN');
    expect(el.classList.contains('money')).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- src/shared/ui/Money.test.tsx`
Expected: FAIL — cannot resolve `./Money`.

- [ ] **Step 3: Write the component**

Create `src/shared/ui/Money.tsx`:

```tsx
import type { ReactNode } from 'react';

/**
 * The one span every rendered figure passes through, so privacy mode has a single selector to blur.
 *
 * It carries no styling of its own and takes no props beyond children: the element around it
 * already owns the typography, and a variant prop here would be a second place to decide how money
 * looks. Which formatter produced the string is still the caller's decision — provenance picks the
 * formatter (see money.ts), this only marks the result as a figure.
 *
 * money.test.ts scans every .tsx for a figure rendered without this wrapper, because nothing in the
 * type system can tell a wrapped figure from a bare string.
 */
export function Money({ children }: { children: ReactNode }) {
  return <span className="money">{children}</span>;
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- src/shared/ui/Money.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the CSS**

Append to `src/app/globals.css`, after the `.toast` block at the end of the component rules:

```css
/* Privacy mode. `data-privacy` on <html> is stamped by use-privacy.ts (and, before first paint, by
   the inline script in layout.tsx); `data-peek` is stamped for as long as a figure is held down.
   Blur is in `em` so it scales with the figure it hides — a 12px caption and a 36px hero need
   different radii to be equally unreadable. */
[data-privacy='on'] .money {
  filter: blur(0.3em);
  transition: filter 120ms ease;
}
[data-privacy='on'][data-peek] .money {
  filter: none;
}
```

- [ ] **Step 6: Confirm the stylesheet's own test still passes**

Run: `npm test -- src/app/globals.test.ts`
Expected: PASS. That suite parses the stylesheet and checks contrast in both themes plus that no `var(--token)` in `src/**` is dangling. These rules declare no colour and no custom property, so nothing there should move. If it fails, the parser has a shape expectation this block breaks — read the failure and adjust the block's formatting, not the assertions.

- [ ] **Step 7: Gates and commit**

```bash
npm run format:files src/shared/ui/Money.tsx src/shared/ui/Money.test.tsx src/app/globals.css
npm run typecheck
npm run lint
npm run format:check
npm test
```

```bash
git add -A
git commit -m "feat(shared): add the one span every figure will pass through" -m "Privacy mode needs a single CSS selector for money, and 89 call sites across 24 files render figures as bare strings today. Money is that seam: a span with a class, no props beyond children, no styling of its own." -m "Inert on its own — no attribute is stamped until the setting lands, so this commit changes nothing a user can see. The blur is in em so one rule works for a 12px caption and a 36px hero alike."
```

---

## Task 5: Wrap every figure, blur the charts, and lock it with a scan

**Files:**

- Modify: the 24 `.tsx` files that render a money formatter
- Modify: `src/features/entries/ui/DonutChart.tsx`, `src/features/entries/ui/TrendChart.tsx`
- Modify: `src/shared/money.test.ts`

**Interfaces:**

- Consumes: `Money` from `@shared/ui/Money` (Task 4).
- Produces: the invariant that every figure in JSX is wrapped, enforced mechanically.

- [ ] **Step 1: Write the failing scan**

Append to `src/shared/money.test.ts` (it already imports `globSync` and `readFileSync` at the top — add nothing):

```ts
// A figure rendered as a bare string and a figure wrapped in <Money> are the same type and render
// identically, so nothing but a scan can tell them apart. Privacy mode blurs `.money` and only
// `.money`: an unwrapped call site is a figure that stays legible over your shoulder with the
// setting on, and it fails no gate on its own.
//
// The rule is narrow on purpose — a formatter call in JSX TEXT position, which is what `>{format`
// identifies. A formatter inside an attribute (`aria-label={...}`) is not visible and is left
// alone, and so is a formatter assigned to a variable or called inside a .ts option-builder.
//
// ponytail: a formatter reached through a template literal in text position (`>{`…${formatBaht(x)}`}`)
// is not matched. Upgrade path if one ever ships: match the backtick form too, rather than widening
// this to every occurrence and drowning in attribute hits.
describe('every figure rendered in JSX goes through <Money>', () => {
  const components = globSync('src/**/*.tsx', {
    exclude: (path) => path.includes('.test.') || path.endsWith('Money.tsx'),
  });

  it('no component renders a formatter result outside <Money>', () => {
    const offenders = components.filter((file) =>
      /(?<!<Money)>\{format(Baht|SignedBaht|LedgerSpend)/.test(
        readFileSync(file, 'utf-8').replace(/\s+/g, ''),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
```

Whitespace is stripped first so a call site prettier has broken across three lines reads the same as a one-liner. `formatBaht` as an alternative also covers `formatBahtWhole` and `formatBahtKeyed` by prefix.

- [ ] **Step 2: Run it and read the list**

Run: `npm test -- src/shared/money.test.ts -t '<Money>'`
Expected: FAIL, listing roughly 24 offending files. That list is your worklist for Step 3.

- [ ] **Step 3: Wrap every call site**

For each file the scan named, wrap each figure in JSX text position:

```tsx
// before
<span className="tnum text-lg font-semibold">{formatBaht(total)}</span>
// after
<span className="tnum text-lg font-semibold">
  <Money>{formatBaht(total)}</Money>
</span>
```

and add `import { Money } from '@shared/ui/Money';` to each file.

Rules while wrapping:

- **Do not change which formatter a call site uses.** The choice encodes provenance and a swap is a real bug: a section total takes the same formatter as the rows it sums (`formatLedgerSpend`), never `formatSignedBaht(-total)` — `money.test.ts` already fails the build for that shape.
- Leave `aria-label` and every other attribute exactly as it is. A screen reader reading your own ledger to you is not the threat.
- Leave `.ts` files alone entirely — the chart option-builders (`donut.ts`, `trend.ts`, `share-card.ts`) draw to canvas or produce strings, and none of them is JSX.
- Where the figure is already the whole content of a `<span>` that carries only `tnum`, replacing that span's class with `money` is NOT equivalent — `tnum` is doing typographic work. Nest instead.

- [ ] **Step 4: Blur the two charts**

`src/features/entries/ui/DonutChart.tsx` — add `money` to the root div's className:

```tsx
      className="money pointer-events-none mx-auto h-64 w-full"
```

`src/features/entries/ui/TrendChart.tsx` — add `money` to its root div's className the same way.

Add a comment above each, once:

```tsx
    // `money` blurs the whole chart under privacy mode: ECharts bakes its labels into a canvas
    // where <Money> cannot reach, so the figures can only be hidden by hiding the picture. Peek is
    // global for the same reason — this root is pointer-events-none, so it can never be the element
    // you press.
```

- [ ] **Step 5: Run the scan and the whole suite**

Run: `npm test -- src/shared/money.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS. Component tests that asserted on figure text still pass — `getByText('฿228.00')` finds the text inside the new span exactly as before, because Testing Library matches the element that directly contains the text.

- [ ] **Step 6: Gates and commit**

```bash
npm run format:files $(git diff --name-only)
npm run typecheck
npm run lint
npm run format:check
npm test
```

```bash
git add -A
git commit -m "feat(app): route every rendered figure through Money" -m "Wraps all 89 money call sites across 24 components, and marks both chart roots so the canvas ECharts bakes its labels into is hidden as one picture rather than leaking every figure a wrapped span would have covered." -m "Locked with a scan in money.test.ts: a figure rendered in JSX text position outside <Money> is a privacy leak that fails no type check and no lint rule, because a wrapped figure and a bare string are the same type and render identically. Still inert — nothing stamps the attribute until the setting lands."
```

---

## Task 6: The privacy setting, the pre-paint stamp, and peek

**Files:**

- Modify: `src/features/settings/theme.ts`, `src/features/settings/queries.ts`, `src/features/settings/actions.ts`
- Create: `src/features/settings/use-privacy.ts`, `src/features/settings/use-privacy.test.ts`
- Create: `src/features/settings/ui/PrivacyToggle.tsx`, `src/features/settings/ui/PrivacyToggle.test.tsx`
- Modify: `src/shared/ui/AppShell.tsx`, `src/app/layout.tsx`, `src/app/settings/page.tsx`
- Test: `src/app/layout.test.ts`, `src/features/settings/theme.test.ts`

**Interfaces:**

- Consumes: the `.money` CSS from Task 4.
- Produces: `PRIVACY_STORAGE_KEY`, `PRIVACIES`, `type Privacy = 'off' | 'on'`, `DEFAULT_PRIVACY`, `isPrivacy`, `readPrivacy` (in `theme.ts`); `getPrivacy` / `setPrivacy` (in `queries.ts`); `setPrivacyAction` (in `actions.ts`); `usePrivacy()` and `applyPrivacy(value)` (in `use-privacy.ts`).

- [ ] **Step 1: Write the failing tests**

Add to `src/features/settings/theme.test.ts`:

```ts
describe('privacy', () => {
  it('pins the storage key the inline script also hardcodes', () => {
    expect(PRIVACY_STORAGE_KEY).toBe('moniflow_privacy');
  });

  it('reads a missing or unknown attribute as the default', () => {
    expect(readPrivacy(null)).toBe('off');
    expect(readPrivacy('yes')).toBe('off');
    expect(readPrivacy('on')).toBe('on');
  });
});
```

Create `src/features/settings/use-privacy.test.ts`, modelled on `use-theme.test.ts` — read that file and mirror its mocking of `@shared/db-effect` and `./queries` rather than inventing a second style:

```ts
describe('usePrivacy', () => {
  it("stamps data-privacy='on' and caches it when the setting is on", async () => { /* … */ });
  it('REMOVES the attribute for the default, rather than stamping off', async () => { /* … */ });
  it('re-runs on a data-version bump', async () => { /* … */ });
});
```

Add to `src/app/layout.test.ts`, inside the existing `describe('the pre-paint inline script mirrors its modules')` and importing `PRIVACY_STORAGE_KEY` from `@features/settings/theme`:

```ts
  it('inlines the privacy key and only stamps the non-default value', () => {
    expect(script).toContain(`'${PRIVACY_STORAGE_KEY}'`);
    expect(script).toContain("dataset.privacy='on'");
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- src/features/settings/theme.test.ts src/app/layout.test.ts src/features/settings/use-privacy.test.ts`
Expected: FAIL on every new assertion.

- [ ] **Step 3: Add the pure values**

Append to `src/features/settings/theme.ts`, whose header comment already frames this module as "appearance preference, as pure values":

```ts
/**
 * Privacy is a third appearance axis, independent of the other two: it hides figures, and touches
 * no colour. Like theme and accent, the DEFAULT stamps no attribute at all, so the ordinary app
 * costs no CSS and cannot drift from the base rules.
 */
export const PRIVACY_STORAGE_KEY = 'moniflow_privacy';

export const PRIVACIES = ['off', 'on'] as const;
export type Privacy = (typeof PRIVACIES)[number];
export const DEFAULT_PRIVACY: Privacy = 'off';

export function isPrivacy(value: unknown): value is Privacy {
  return typeof value === 'string' && PRIVACIES.some((p) => p === value);
}

/** The applied state, read back off <html>. An absent attribute means the default. */
export function readPrivacy(attr: string | null): Privacy {
  return isPrivacy(attr) ? attr : DEFAULT_PRIVACY;
}
```

- [ ] **Step 4: Add the read/write pair**

Append to `src/features/settings/queries.ts`, immediately after `setAccent` (the appearance block), importing `DEFAULT_PRIVACY`, `isPrivacy`, and `type Privacy` from `./theme` alongside the existing theme imports:

```ts
const PRIVACY_KEY = 'privacy';

/** Falls back to 'off' for a fresh DB, one that predates this setting, or a corrupted value. */
export async function getPrivacy(db: Db): Promise<Privacy> {
  const [row] = await db.select().from(settings).where(eq(settings.key, PRIVACY_KEY)).all();
  return row !== undefined && isPrivacy(row.value) ? row.value : DEFAULT_PRIVACY;
}

export async function setPrivacy(db: Db, value: Privacy): Promise<void> {
  await db.batch([
    db.delete(settings).where(eq(settings.key, PRIVACY_KEY)),
    db.insert(settings).values({ key: PRIVACY_KEY, value }),
  ]);
}
```

- [ ] **Step 5: Add the action**

Append to `src/features/settings/actions.ts`, mirroring `setThemeAction` exactly (same signature shape — a typed value, not FormData):

```ts
// Backing the privacy toggle. Bumps the data version so useSettings re-reads and usePrivacy
// re-stamps, which is also what refreshes the localStorage cache the pre-paint script reads.
export async function setPrivacyAction(value: Privacy): Promise<void> {
  if (!isPrivacy(value)) throw new Error(`Unknown privacy mode: ${String(value)}`);
  const db = await getBrowserDb();
  await setPrivacy(db, value);
  bumpDataVersion();
}
```

Add `setPrivacy` to the `./queries` import list and `isPrivacy, type Privacy` to the `./theme` import list at the top of the file.

- [ ] **Step 6: Write the hook**

Create `src/features/settings/use-privacy.ts`:

```ts
'use client';

import { useEffect } from 'react';
import { withDb } from '@shared/db-effect';
import { getPrivacy } from './queries';
import { DEFAULT_PRIVACY, PRIVACY_STORAGE_KEY, type Privacy } from './theme';
import { useDataVersion } from '@shared/data-version';

// Privacy's half of the appearance stamp, and the exact shape of useTheme: OPFS is the source of
// truth, <html> carries the applied state, and localStorage carries a copy the pre-paint script in
// layout.tsx reads before any bundle loads.
//
// That pre-paint copy is the feature, not an optimisation. Reads here are async and post-mount, so
// without it every app open paints the real balance for the length of an OPFS round trip and only
// then hides it. A privacy mode with a flash of the truth is not a privacy mode.
//
// Peek lives here too: one delegated listener, because press-and-hold has to work over a chart as
// well, and DonutChart's root is pointer-events-none (it lets a swipe through to the cycle-swipe
// wrapper) so the chart can never be the element you press. Holding ANY figure clears the blur
// everywhere, which is what makes a blurred chart readable at all.
export function usePrivacy(): void {
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      const privacy = await getPrivacy(db);
      applyPrivacy(privacy);
      localStorage.setItem(PRIVACY_STORAGE_KEY, privacy);
    });
  }, [version]);

  useEffect(() => {
    function down(e: PointerEvent): void {
      const target = e.target;
      if (target instanceof Element && target.closest('.money') !== null) {
        document.documentElement.dataset.peek = '';
      }
    }
    function up(): void {
      delete document.documentElement.dataset.peek;
    }
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
  }, []);
}

// Exported so the toggle can stamp optimistically on click without waiting for the write to reach
// OPFS and the data-version bump to come back around. The hook remains the only writer of the CACHE.
export function applyPrivacy(privacy: Privacy): void {
  if (privacy === DEFAULT_PRIVACY) delete document.documentElement.dataset.privacy;
  else document.documentElement.dataset.privacy = privacy;
}
```

- [ ] **Step 7: Call it from the shell**

In `src/shared/ui/AppShell.tsx`, import `usePrivacy` from `@features/settings/use-privacy` and call it on the line after `useTheme()`. AppShell is the composition root and already imports seven feature modules by design, so this adds no new dependency-rule exception.

- [ ] **Step 8: Extend the pre-paint script**

In `src/app/layout.tsx`, add one more concatenated line to the `__html` string, after the accent branch:

```js
              "var v=localStorage.getItem('moniflow_privacy');" +
              "if(v==='on')d.dataset.privacy='on';" +
```

The script cannot import a module (it runs before any bundle), so the key is an inlined literal — that is why `layout.test.ts` pins it against `PRIVACY_STORAGE_KEY`.

- [ ] **Step 9: Build the toggle**

Create `src/features/settings/ui/PrivacyToggle.tsx`, modelled on `ThemePicker.tsx` — read that file and copy its structure: a `fieldset` + `legend`, a `role="group"` of `aria-pressed` buttons (deliberately NOT a `radiogroup`, which would promise arrow-key cycling this does not implement), state read back from `document.documentElement.dataset` in an effect rather than from localStorage, and `choose()` doing `setState` → `applyPrivacy` → `void setPrivacyAction(value)`.

Reading the APPLIED state off `<html>` rather than the cache matters here for the same reason it does in `ThemePicker`: saving bumps the data version, `useSettings` drops `ready`, the Settings page swaps in a placeholder, and this component REMOUNTS on every pick. Only the attribute survives that.

Labels: `Off` and `On`, legend `Hide amounts`, plus a one-line caption under the group: `Blurs every figure. Press and hold one to read it.`

- [ ] **Step 10: Place it**

In `src/app/settings/page.tsx`, add `<PrivacyToggle />` directly after `<AccentPicker />` inside the Appearance section (currently lines 136-139), and import it from `@features/settings/ui/PrivacyToggle`.

- [ ] **Step 11: Run everything**

Run: `npm test`
Expected: PASS in full.

- [ ] **Step 12: Gates and commit**

```bash
npm run format:files $(git diff --name-only)
npm run typecheck
npm run lint
npm run format:check
npm test
```

```bash
git add -A
git commit -m "feat(features): hide the money until you hold it" -m "A privacy toggle in Settings blurs every figure the app renders, charts included. There is no auth here on purpose (a static export has no server to enforce one) and the app is a phone-shaped column of large money, so the realistic threat is the person beside you rather than an attacker." -m "Copies the theme's two-layer stamp exactly, including the localStorage cache the pre-paint script reads: reads are async and post-mount, so without that line every app open would paint the real balance for the length of an OPFS round trip before hiding it. Peek is press-and-hold and deliberately global, because the donut root is pointer-events-none and can never be the element you press."
```

---

## Task 7: `findDuplicateGroups`

**Files:**

- Create: `src/features/entries/duplicates.ts`, `src/features/entries/duplicates.test.ts`

**Interfaces:**

- Consumes: `EntryRow` from `./schema`.
- Produces: `findDuplicateGroups(rows: EntryRow[]): EntryRow[][]`.

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/duplicates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findDuplicateGroups } from './duplicates';
import type { EntryRow } from './schema';

function row(over: Partial<EntryRow> = {}): EntryRow {
  return {
    id: 1,
    date: '2026-09-01',
    time: null,
    accountId: 1,
    categoryId: 7,
    amount: -120,
    currency: null,
    originalAmount: null,
    note: null,
    source: 'manual',
    offBudget: null,
    category: 'อาหาร',
    account: 'เงินสด',
    ...over,
  };
}

describe('findDuplicateGroups', () => {
  it('returns nothing for a clean ledger', () => {
    expect(findDuplicateGroups([row({ id: 1 }), row({ id: 2, amount: -50 })])).toEqual([]);
  });

  it('groups two rows sharing date, amount and category', () => {
    const groups = findDuplicateGroups([row({ id: 1 }), row({ id: 2 })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((r) => r.id)).toEqual([1, 2]);
  });

  it('groups rows that differ ONLY by account', () => {
    const groups = findDuplicateGroups([
      row({ id: 1, accountId: 1, account: 'เงินสด' }),
      row({ id: 2, accountId: 2, account: 'บัตรเครดิต' }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('separates rows differing in date, amount or category', () => {
    expect(findDuplicateGroups([row({ id: 1 }), row({ id: 2, date: '2026-09-02' })])).toEqual([]);
    expect(findDuplicateGroups([row({ id: 1 }), row({ id: 2, amount: -121 })])).toEqual([]);
    expect(findDuplicateGroups([row({ id: 1 }), row({ id: 2, categoryId: 8 })])).toEqual([]);
  });

  it('keeps id order inside a group so the original comes first', () => {
    const groups = findDuplicateGroups([row({ id: 9 }), row({ id: 4 }), row({ id: 6 })]);
    expect(groups[0].map((r) => r.id)).toEqual([4, 6, 9]);
  });

  it('orders groups newest date first', () => {
    const groups = findDuplicateGroups([
      row({ id: 1, date: '2026-07-01' }),
      row({ id: 2, date: '2026-07-01' }),
      row({ id: 3, date: '2026-09-01' }),
      row({ id: 4, date: '2026-09-01' }),
    ]);
    expect(groups.map((g) => g[0].date)).toEqual(['2026-09-01', '2026-07-01']);
  });

  it('groups a refund with a refund, never a refund with an expense', () => {
    expect(findDuplicateGroups([row({ id: 1, amount: -120 }), row({ id: 2, amount: 120 })])).toEqual(
      [],
    );
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- src/features/entries/duplicates.test.ts`
Expected: FAIL — cannot resolve `./duplicates`.

- [ ] **Step 3: Write the implementation**

Create `src/features/entries/duplicates.ts`:

```ts
import type { EntryRow } from './schema';

// Rows the ledger holds twice: same date, same amount, same category.
//
// Three writers can put a row here — the keypad, a Monefy CSV import, and the recurring sweep on app
// open — and none of them checks the others. Nothing else in the app notices when two of them land
// on the same spend.
//
// Account is deliberately NOT part of the key: paying one bill twice from two different cards is
// exactly the mistake worth catching, and keying on the account would hide it. Nor is there a date
// window — a ±1 day rule flags the entirely normal case of buying the same coffee two mornings
// running, and in a tool whose only affordance is Delete, a false positive costs more than a miss.
//
// The sign is part of the amount, so an expense never groups with the refund that reverses it.
export function findDuplicateGroups(rows: EntryRow[]): EntryRow[][] {
  const buckets = new Map<string, EntryRow[]>();
  for (const row of rows) {
    const key = `${row.date}|${row.amount}|${row.categoryId}`;
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [row]);
    else bucket.push(row);
  }

  const groups: { date: string; rows: EntryRow[] }[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue;
    // Oldest id first: whichever row was written first reads as the original, and the ones under it
    // as the suspects. That ordering is the only guidance the list gives about which to delete.
    groups.push({ date: key.slice(0, key.indexOf('|')), rows: [...bucket].sort((a, b) => a.id - b.id) });
  }

  return groups.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).map((g) => g.rows);
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- src/features/entries/duplicates.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Gates**

```bash
npm run format:files src/features/entries/duplicates.ts src/features/entries/duplicates.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

Do NOT commit yet — Task 8 completes the feature.

---

## Task 8: The duplicate scan surface

**Files:**

- Create: `src/features/entries/ui/DuplicateScan.tsx`, `src/features/entries/ui/DuplicateScan.test.tsx`
- Modify: `src/app/settings/page.tsx`

**Interfaces:**

- Consumes: `findDuplicateGroups` (Task 7), `getEntries` from `../queries`, `deleteEntryAction` and `undoDeleteEntry` from `../actions`, `toast` from `@shared/ui/toast`, `Money` from `@shared/ui/Money`.
- Produces: `<DuplicateScan />`, taking no props.

**Behaviour:**

1. Renders a single button, `Scan for duplicates`. Nothing runs on mount — the scan reads the whole ledger through `getEntries` (the same read the backup export performs) and no one needs that on every Settings visit.
2. On tap it reads through `withDb`, runs `findDuplicateGroups`, and renders the result.
3. Each group renders its rows: date, category, account, note, amount (through `<Money>`), and a `Delete` button per row.
4. Delete calls `deleteEntryAction(id)`, which returns the row's own snapshot, and raises the existing Undo toast with `undoDeleteEntry(snapshot)` — the same pairing the Records swipe uses. Copy that call site rather than writing a second one.
5. After a delete, re-run the scan over the rows already in state minus the deleted id, so the list settles without a second ledger read.
6. An empty result renders `No duplicates found`, not nothing.

- [ ] **Step 1: Write the failing tests**

Create `src/features/entries/ui/DuplicateScan.test.tsx`. Mock `../queries` and `../actions` the way the other `ui/*.test.tsx` files in this directory do — read one first and match it.

```tsx
describe('DuplicateScan', () => {
  it('reads nothing until the scan button is pressed', async () => { /* getEntries not called on mount */ });
  it('renders one group per duplicate set, oldest row first', async () => { /* … */ });
  it('says so when the ledger is clean', async () => { /* 'No duplicates found' */ });
  it('deletes a row through deleteEntryAction and offers Undo', async () => { /* … */ });
  it('drops a group from the list once it is down to one row', async () => { /* … */ });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- src/features/entries/ui/DuplicateScan.test.tsx`
Expected: FAIL — cannot resolve `./DuplicateScan`.

- [ ] **Step 3: Write the component**

Create `src/features/entries/ui/DuplicateScan.tsx` as a `'use client'` component. Use `withDb` for the read (it is a read, and a failed OPFS boot must stay quiet — `DbUnavailable` owns that message). Use `useState` for `groups: EntryRow[][] | null`, where `null` means "not scanned yet" and `[]` means "scanned, clean" — the empty state and the initial state must not render the same thing.

Header comment to include:

```tsx
// On demand, never on mount: the scan reads the entire ledger (the same read the backup export
// performs) and a Settings visit is not a reason to pay for it. `null` groups means "not scanned",
// `[]` means "scanned and clean" — collapsing those two would make the empty state indistinguishable
// from the initial one, and the whole value of the surface is the sentence "No duplicates found".
```

- [ ] **Step 4: Place it on the Settings page**

In `src/app/settings/page.tsx`, add a section immediately BEFORE the danger-zone section (currently at line 301), matching the surrounding sections' markup:

```tsx
      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold">Duplicates</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Rows sharing a date, an amount and a category. Three things write to the ledger and none of
          them checks the others.
        </p>
        <DuplicateScan />
      </section>
```

Use the muted-text token name the other captions on this page already use; read one and copy it rather than guessing.

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/features/entries/ui/DuplicateScan.test.tsx`
Expected: PASS.

- [ ] **Step 6: Gates and commit**

```bash
npm run format:files $(git diff --name-only)
npm run typecheck
npm run lint
npm run format:check
npm test
```

```bash
git add -A
git commit -m "feat(features): find the rows that were entered twice" -m "Three writers reach this ledger — the keypad, a Monefy CSV import, and the recurring sweep on app open — and none of them checks the others. An on-demand scan in Settings lists rows sharing a date, an amount and a category, and deletes through the existing action so the Undo toast comes along unchanged." -m "Account is deliberately not part of the key: one bill paid twice from two cards is exactly the mistake worth catching. There is no date window either, because a one-day tolerance flags the same coffee bought two mornings running, and in a tool whose only affordance is Delete a false positive costs more than a miss."
```

---

## Final verification, before any merge

The suite runs under jsdom against the Node shim. It proves none of these three in a real browser — not OPFS, not the WASM worker, not the service worker, not layout, and not a pointer event. Drive the app at 412px and confirm:

- [ ] Type a note you have used many times on the keypad. The account chip switches to the one that note usually takes, and the save chip names the right category. Tapping it writes a real entry — check it on `/records`.
- [ ] Tap the account chip and pick a different account, then save with the suggestion chip. The account you picked wins.
- [ ] Turn privacy on in Settings. Every figure on Home, `/records`, `/analytics`, `/budgets` and `/year` blurs, and both charts blur as a whole.
- [ ] Hard-reload with privacy on. **No figure is legible at any point during load** — this is the assertion the pre-paint line exists for, and the one thing no jsdom test can make.
- [ ] Press and hold any figure. Everything unblurs, charts included. Release. Everything re-blurs.
- [ ] Create a deliberate duplicate: enter the same ฿1 row twice, same category, same day. Scan finds it, Delete removes one, Undo puts it back under the same id. Then delete both for real — the dev ledger holds REAL data, so clean up what you created.
- [ ] Export a backup with privacy on and confirm the settings section of the file carries `privacy,on`, and that the share card's PNG is NOT blurred.

## Self-review notes

- **Spec coverage:** note suggestion → Tasks 1-3; privacy state, pre-paint, `<Money>`, charts, peek, toggle, scan test → Tasks 4-6; duplicates → Tasks 7-8. Every spec section has a task.
- **Deliberate deviations from the spec, both narrowing:** the chip is gated on `entry === undefined` rather than only on `isCopy`, which also suppresses it while editing (an edit already carries its own category, so the chip would be a second competing answer there too); and privacy lands as three commits instead of one, ordered so no commit in history contains a half-wrapped privacy mode.
- **Interface consistency:** `NoteSuggestionRow` is declared once, in `queries.ts` (Task 1 Step 1), and imported by `note-suggest.ts`, its tests, `use-new-entry.ts`, and `Keypad.tsx`. `Privacy`, `isPrivacy`, `DEFAULT_PRIVACY`, `PRIVACY_STORAGE_KEY` and `readPrivacy` are declared once, in `theme.ts`, and consumed by `queries.ts`, `actions.ts`, `use-privacy.ts`, `PrivacyToggle.tsx` and `layout.test.ts`. `applyPrivacy` lives in `use-privacy.ts` beside `applyTheme`'s twin in `use-theme.ts`.
