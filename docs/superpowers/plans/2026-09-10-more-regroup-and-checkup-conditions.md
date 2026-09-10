# More Regrouping + Configurable Checkup Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regroup the More sheet into Lists/Review/Plan/App, and let the Checkup duplicate scan choose which fields must match instead of hardcoding date+amount+category.

**Architecture:** Two independent changes that share no file. Task 1 rewrites one constant in `MoreSheet.tsx` and adds the guard test that file has never had. Tasks 2–3 turn `findDuplicateGroups` from a fixed rule into a pure function of `(rows, fields)`, then move `DuplicateScan` from storing computed groups to storing the scanned rows and deriving groups with `useMemo` — so toggling a condition re-groups in memory instead of re-reading ten thousand rows over the worker RPC.

**Tech Stack:** TypeScript 5.9 strict (ESM), React 19, Next.js 16 App Router (static export, every page `'use client'`), Tailwind CSS v4, Vitest + Testing Library under jsdom.

Spec: `docs/superpowers/specs/2026-09-10-more-regroup-and-checkup-conditions-design.md`

## Global Constraints

- **No `any`, no `as` casts, no `!` assertions, no `@ts-ignore`/`@ts-nocheck`/`@ts-expect-error`.** These are ESLint **errors** in this repo, not warnings. Prefer `type` aliases over `interface`, `for..of` over `forEach`, `satisfies` + `as const` for config objects. `as const` alone stays allowed.
- **Shell is Git Bash (POSIX syntax).** Never PowerShell, never `cmd /c`.
- **Run all commands from the repo root** (`H:/code/moniflow`). Do not use `git -C`.
- **Quality gates before every commit**, run separately so failures surface individually:
  ```bash
  npm run format:files <the files you changed>
  npm run typecheck
  npm run lint
  npm run format:check
  npm test
  ```
  All five must pass.
- **Commit format:** `type(scope): description` then a body explaining WHY and WHAT, using **repeated `-m` flags** — never `-F file`, never a heredoc (the wrapped `git` on this machine never receives stdin, so the commit-msg hook rejects the message as empty). Scope is a single word: `app`, `features`, `shared`, or `db`.
- **Never add `Co-Authored-By:` or `Claude-Session:` trailers.** A global hook strips them anyway.
- **The branch is already created:** `feat/more-regroup-checkup-conditions`. Do not work on `main`.
- **TDD:** failing test first, watch it fail for the right reason, then the minimal implementation.
- **Comments in this repo carry reasoning, not restatement.** When you change behaviour a comment describes, rewrite the comment in the same edit. A comment that now lies is a defect.

---

### Task 1: Regroup the More sheet

**Files:**

- Modify: `src/shared/ui/MoreSheet.tsx` — the `GROUPS` constant (lines 24–83) and the block comment above it
- Create: `src/shared/ui/MoreSheet.test.tsx`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on. `MoreSheet`'s props (`{ open: boolean; onClose: () => void }`) are unchanged.

The twelve destinations regroup from Review(4)/Plan(2)/Set up(6) into:

| Group id | Caption | Tiles                            |
| -------- | ------- | -------------------------------- |
| `lists`  | Lists   | Categories · Accounts · Currency |
| `review` | Review  | Year · Month · Report · Trips    |
| `plan`   | Plan    | Budgets · Recurring              |
| `app`    | App     | Settings · Checkup · About       |

Every tile keeps the `href`, `label`, `Icon` and `cycle` flag it has today. **Budgets is the only tile with `cycle: true`** — it reads the selected billing cycle, and losing that flag silently drops the cycle on every tap.

- [ ] **Step 1: Write the failing test**

Create `src/shared/ui/MoreSheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('cycle=2026-08'),
}));

import { MoreSheet } from './MoreSheet';

// Rendered closed on purpose: the useEffect only calls close() on a closed <dialog>, so nothing
// touches showModal (which jsdom supports unevenly). The anchors are in the DOM either way, and
// querySelectorAll sees them regardless of the dialog's visibility.
function hrefs(): string[] {
  const { container } = render(<MoreSheet open={false} onClose={() => {}} />);
  return [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
}

describe('MoreSheet', () => {
  it('lists every destination once, in group order', () => {
    expect(hrefs()).toEqual([
      '/categories',
      '/accounts',
      '/currency',
      '/year',
      '/month',
      '/report',
      '/trips',
      '/budgets?cycle=2026-08',
      '/recurring',
      '/settings',
      '/checkup',
      '/about',
    ]);
  });

  it('captions each group', () => {
    const { container } = render(<MoreSheet open={false} onClose={() => {}} />);
    expect([...container.querySelectorAll('h3')].map((h) => h.textContent)).toEqual([
      'Lists',
      'Review',
      'Plan',
      'App',
    ]);
  });

  // Budgets is the ONLY cycle-carrying destination. Regrouping moves tiles between array literals,
  // which is exactly the edit that can drop a per-tile flag without any test noticing.
  it('carries the selected cycle on Budgets alone', () => {
    const carrying = hrefs().filter((h) => h.includes('cycle='));
    expect(carrying).toEqual(['/budgets?cycle=2026-08']);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

```bash
npm test -- src/shared/ui/MoreSheet.test.tsx
```

Expected: FAIL. The first test reports the current order (`/year`, `/month`, `/report`, `/trips`, `/budgets?cycle=2026-08`, `/recurring`, `/categories`, …) against the expected one, and the caption test reports `['Review', 'Plan', 'Set up']`. The third test should already pass — that is the invariant being pinned, not a change.

- [ ] **Step 3: Replace the `GROUPS` constant and its comment**

In `src/shared/ui/MoreSheet.tsx`, replace the whole block comment plus the `GROUPS` constant (from `// App-launcher grid for the overflow nav` down to `] as const;`) with:

```tsx
// App-launcher grid for the overflow nav — one icon tile per destination, matching the 2×2 grid glyph
// on the "More" tab that opens this sheet. lucide icons (a dependency since the icon-set feature).
//
// GROUPED BY WHAT YOU CAME FOR, three to a row, and ordered by how often the owner actually opens
// them. Lists leads: Categories, Accounts and Currency are the three most-visited destinations in
// the app, and they fill one row exactly. Review is the "look back" set, Plan the forward-looking
// one, and App the pages you open rarely and deliberately.
//
// Checkup sits in App, not with the lists it superficially resembles. It configures nothing — it
// scans the ledger for duplicate rows and deletes them — but its VISIT CADENCE is Settings',
// not Categories'. It previously sat in a "Set up" group it joined for a layout reason (six tiles
// filled two clean rows), which is not a reason.
//
// Twelve tiles across three columns: Lists and App fill a row each, Review wraps to a row of three
// plus one, Plan is a short row of two. That is why the captions earn their space — under a heading
// a short row or an orphan tile reads as the end of a group, and unlabelled it just reads as a hole.
//
// `cycle: true` marks a destination that READS the selected cycle, so its href carries ?cycle= the
// same way BottomBar's primary tabs do. Budgets is the only one, and it landed here when Analytics
// took its tab slot — without this it would silently drop the cycle on every tap.
const GROUPS = [
  {
    id: 'lists',
    caption: 'Lists',
    links: [
      { href: '/categories', label: 'Categories', Icon: Tags, cycle: false },
      { href: '/accounts', label: 'Accounts', Icon: Wallet, cycle: false },
      { href: '/currency', label: 'Currency', Icon: Coins, cycle: false },
    ],
  },
  {
    id: 'review',
    caption: 'Review',
    links: [
      { href: '/year', label: 'Year', Icon: CalendarRange, cycle: false },
      // cycle: false — /month is keyed by ?month=, a calendar month with no year attached, so a
      // ?cycle= tagging along would be inert noise in the URL.
      { href: '/month', label: 'Month', Icon: CalendarClock, cycle: false },
      // cycle: false — /report is keyed by ?year=/?view=, a window of its own choosing; a ?cycle=
      // tagging along would be inert noise in the URL.
      { href: '/report', label: 'Report', Icon: PieChart, cycle: false },
      { href: '/trips', label: 'Trips', Icon: Plane, cycle: false },
    ],
  },
  {
    id: 'plan',
    caption: 'Plan',
    links: [
      { href: '/budgets', label: 'Budgets', Icon: Target, cycle: true },
      { href: '/recurring', label: 'Recurring', Icon: Repeat, cycle: false },
    ],
  },
  {
    id: 'app',
    caption: 'App',
    links: [
      { href: '/settings', label: 'Settings', Icon: Settings, cycle: false },
      // cycle: false — the scan reads the WHOLE ledger, not a cycle, so a ?cycle= riding along
      // would be inert noise in the URL.
      { href: '/checkup', label: 'Checkup', Icon: Stethoscope, cycle: false },
      { href: '/about', label: 'About', Icon: Info, cycle: false },
    ],
  },
] as const;
```

Nothing below `GROUPS` changes — the imports, the component, and the rendering loop stay exactly as they are.

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- src/shared/ui/MoreSheet.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Run the gates**

```bash
npm run format:files src/shared/ui/MoreSheet.tsx src/shared/ui/MoreSheet.test.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all pass. The full suite should show no new failures.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ui/MoreSheet.tsx src/shared/ui/MoreSheet.test.tsx
git commit -m "refactor(shared): regroup the More sheet into Lists, Review, Plan and App" -m "Categories, Accounts and Currency are the three most-opened destinations in the app and now lead the sheet as one full row. Checkup leaves the Set up group it only joined to fill a grid row - it configures nothing, and its visit cadence is Settings', not Categories'." -m "Adds the first test file this component has had. Regrouping moves tiles between array literals, which is exactly the edit that can silently drop the cycle: true flag off Budgets and lose the selected cycle on every tap."
```

---

### Task 2: `findDuplicateGroups` takes the fields that must match

**Files:**

- Modify: `src/features/entries/duplicates.ts` (whole file)
- Test: `src/features/entries/duplicates.test.ts` (append new cases; the twelve existing ones stay untouched)

**Interfaces:**

- Consumes: `EntryRow` from `src/features/entries/schema.ts`. It has `id`, `date`, `amount`, `categoryId`, `accountId`, `note` (`string | null`), plus the joined display names `category` and `account`.
- Produces, for Task 3:
  ```ts
  export const DUPLICATE_FIELDS: readonly ['date', 'amount', 'category', 'account', 'note'];
  export type DuplicateField = (typeof DUPLICATE_FIELDS)[number];
  export const DEFAULT_DUPLICATE_FIELDS: readonly DuplicateField[];
  export function findDuplicateGroups(
    rows: EntryRow[],
    fields?: readonly DuplicateField[],
  ): EntryRow[][];
  ```
  `fields` defaults to `DEFAULT_DUPLICATE_FIELDS`, which is `['date', 'amount', 'category']` — the historical rule. That default is what keeps the twelve existing test cases valid without editing a single one.

Three behaviours change:

1. The key is built from the fields passed in, not from three hardcoded ones.
2. Group ordering stops parsing the key string. Today the date is recovered with `key.slice(0, key.indexOf('|'))`, which assumes date is the first key segment — unchecking "date" makes that expression return the amount and sort the list by a number-shaped string. Read `date` off the first row of the bucket instead.
3. An empty `fields` returns `[]`. With no fields every row shares one key and the whole ledger becomes a single group.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/entries/duplicates.test.ts`, inside the existing `describe('findDuplicateGroups', …)` block, after the last `it`:

```ts
it('keys on account when account is one of the fields', () => {
  const rows = [
    row({ id: 1, accountId: 1, account: 'เงินสด' }),
    row({ id: 2, accountId: 2, account: 'บัตรเครดิต' }),
  ];
  // The historical rule ignores account, so these two group.
  expect(findDuplicateGroups(rows)).toHaveLength(1);
  // Adding account to the key separates them.
  expect(findDuplicateGroups(rows, ['date', 'amount', 'category', 'account'])).toEqual([]);
});

it('drops date from the key so rows on different dates can group', () => {
  const rows = [row({ id: 1, date: '2026-09-01' }), row({ id: 2, date: '2026-09-04' })];
  expect(findDuplicateGroups(rows)).toEqual([]);
  const groups = findDuplicateGroups(rows, ['amount', 'category']);
  expect(groups).toHaveLength(1);
  expect(groups[0].map((r) => r.id)).toEqual([1, 2]);
});

it('treats a null note and an empty note as the same note', () => {
  const groups = findDuplicateGroups(
    [row({ id: 1, note: null }), row({ id: 2, note: '   ' })],
    ['date', 'amount', 'category', 'note'],
  );
  expect(groups).toHaveLength(1);
});

it('separates rows whose notes differ once note is keyed', () => {
  const rows = [row({ id: 1, note: 'ข้าวเช้า' }), row({ id: 2, note: 'ข้าวเย็น' })];
  expect(findDuplicateGroups(rows)).toHaveLength(1);
  expect(findDuplicateGroups(rows, ['date', 'amount', 'category', 'note'])).toEqual([]);
});

it('ignores surrounding whitespace when comparing notes', () => {
  const groups = findDuplicateGroups(
    [row({ id: 1, note: 'กาแฟ' }), row({ id: 2, note: '  กาแฟ  ' })],
    ['note'],
  );
  expect(groups).toHaveLength(1);
});

// With nothing to key on every row shares one key and the whole ledger becomes a single group.
// The UI makes this unreachable, but the function is exported and must stay total.
it('returns nothing when no fields are given', () => {
  expect(findDuplicateGroups([row({ id: 1 }), row({ id: 2 })], [])).toEqual([]);
});

// The group heading order used to be recovered by slicing the key string, which silently read the
// amount as a date the moment date left the key.
it('orders groups newest first by the oldest row in each group, with date unkeyed', () => {
  const groups = findDuplicateGroups(
    [
      row({ id: 1, date: '2026-07-01', amount: -10 }),
      row({ id: 2, date: '2026-07-02', amount: -10 }),
      row({ id: 3, date: '2026-09-01', amount: -20 }),
      row({ id: 4, date: '2026-09-02', amount: -20 }),
    ],
    ['amount', 'category'],
  );
  expect(groups.map((g) => g[0].date)).toEqual(['2026-09-01', '2026-07-01']);
});
```

- [ ] **Step 2: Run the tests and confirm they fail for the right reason**

```bash
npm test -- src/features/entries/duplicates.test.ts
```

Expected: FAIL. TypeScript/Vitest rejects the two-argument calls because `findDuplicateGroups` currently takes one parameter — the message names an argument-count mismatch, not a wrong value.

- [ ] **Step 3: Rewrite `duplicates.ts`**

Replace the entire contents of `src/features/entries/duplicates.ts` with:

```ts
import type { EntryRow } from './schema';

// The fields a duplicate scan can require to match, in the order the Checkup page lists them.
export const DUPLICATE_FIELDS = ['date', 'amount', 'category', 'account', 'note'] as const;

export type DuplicateField = (typeof DUPLICATE_FIELDS)[number];

// The rule the scan shipped with, and what it still starts on: same date, same amount, same
// category.
//
// Account is off by default on purpose: paying one bill twice from two different cards is exactly
// the mistake worth catching, and keying on the account hides it. Date is exact, never a window — a
// ±1 day rule flags the entirely normal case of buying the same coffee two mornings running, and in
// a tool whose only affordance is Delete, a false positive costs more than a miss.
export const DEFAULT_DUPLICATE_FIELDS: readonly DuplicateField[] = ['date', 'amount', 'category'];

// Category and account compare by id, not by display name: that is what the entry actually stores,
// and it survives a rename. A note compares trimmed, so a null note and a whitespace-only one are
// the same note. The sign is part of the amount, so an expense never groups with the refund that
// reverses it.
function fieldValue(row: EntryRow, field: DuplicateField): string | number {
  switch (field) {
    case 'date':
      return row.date;
    case 'amount':
      return row.amount;
    case 'category':
      return row.categoryId;
    case 'account':
      return row.accountId;
    case 'note':
      return row.note?.trim() ?? '';
  }
}

// Rows the ledger holds more than once, grouped by the fields the caller says must match.
//
// Three writers can put a row here — the keypad, a Monefy CSV import, and the recurring sweep on app
// open — and none of them checks the others. Nothing else in the app notices when two of them land
// on the same spend.
//
// `fields` defaults to the historical rule (see DEFAULT_DUPLICATE_FIELDS). An EMPTY `fields` yields
// nothing rather than one enormous group: with nothing to key on every row shares a key. The Checkup
// UI makes that state unreachable by refusing to clear the last checkbox, but this function is
// exported and has to stay total.
//
// JSON.stringify rather than a join: a note is free text and can contain the separator.
export function findDuplicateGroups(
  rows: EntryRow[],
  fields: readonly DuplicateField[] = DEFAULT_DUPLICATE_FIELDS,
): EntryRow[][] {
  if (fields.length === 0) return [];

  const buckets = new Map<string, EntryRow[]>();
  for (const row of rows) {
    const key = JSON.stringify(fields.map((field) => fieldValue(row, field)));
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [row]);
    else bucket.push(row);
  }

  const groups: EntryRow[][] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    // Oldest id first: whichever row was written first reads as the original, and the ones under it
    // as the suspects. That ordering is the only guidance the list gives about which to delete.
    groups.push([...bucket].sort((a, b) => a.id - b.id));
  }

  // Newest first, by the oldest row in each group. When `date` is one of the fields every row in a
  // group shares it, so this is simply the group's date; when it is not, the rows may span dates and
  // this picks one deterministically. Never recover the date from the key — the key's shape is now
  // the caller's choice, and slicing it would read whichever field happens to come first.
  return groups.sort((a, b) => (a[0].date < b[0].date ? 1 : a[0].date > b[0].date ? -1 : 0));
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- src/features/entries/duplicates.test.ts
```

Expected: PASS, 14 tests — the seven that existed plus the seven added in Step 1. If any of the original seven fails, the default field set is wrong.

- [ ] **Step 5: Run the gates**

```bash
npm run format:files src/features/entries/duplicates.ts src/features/entries/duplicates.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all pass. `DuplicateScan.tsx` still compiles because the new parameter is optional.

- [ ] **Step 6: Commit**

```bash
git add src/features/entries/duplicates.ts src/features/entries/duplicates.test.ts
git commit -m "feat(features): let the duplicate scan choose which fields must match" -m "findDuplicateGroups took one fixed rule - same date, same amount, same category. It now takes the fields to key on, defaulting to those three so nothing changes for existing callers." -m "Two follow-ons that are correctness, not polish: the group order stops recovering the date by slicing the key string (which would read the amount as a date the moment date left the key), and an empty field list returns nothing instead of collapsing the whole ledger into one group."
```

---

### Task 3: Choose the conditions on the Checkup page

**Files:**

- Modify: `src/features/entries/ui/DuplicateScan.tsx`
- Modify: `src/app/checkup/page.tsx` (the header sentence only)
- Test: `src/features/entries/ui/DuplicateScan.test.tsx` (append two cases)

**Interfaces:**

- Consumes from Task 2: `DUPLICATE_FIELDS`, `DEFAULT_DUPLICATE_FIELDS`, `findDuplicateGroups(rows, fields)` and the `DuplicateField` type, all from `../duplicates`.
- Produces: nothing other tasks rely on.

Two changes in one component:

**The component holds `rows`, not `groups`.** Today it stores the computed groups, so changing a condition would mean re-reading the whole ledger over the worker RPC to recompute something that is a pure function of data already in memory. Store the scanned rows and derive groups with `useMemo`. `rows === null` still means "not scanned" and `[]` still means "scanned and clean" — the empty state depends on that distinction.

**A checkbox row above the Scan button** picks the fields. The last checked box cannot be cleared.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/entries/ui/DuplicateScan.test.tsx`, inside the existing `describe('DuplicateScan', …)` block:

```tsx
it('re-groups on a condition change without re-reading the ledger', async () => {
  // Two rows alike but for the account: one group under the default rule, none once account counts.
  getEntries.mockResolvedValue([
    row({ id: 1, accountId: 1, account: 'Cash' }),
    row({ id: 2, accountId: 2, account: 'Card' }),
  ]);
  render(<DuplicateScan />);
  await act(async () => {
    clickScan();
  });
  expect(screen.getAllByRole('button', { name: /^Delete / })).toHaveLength(2);

  fireEvent.click(screen.getByRole('checkbox', { name: 'Account' }));

  expect(screen.getByText('No duplicates found')).toBeInTheDocument();
  // The whole point of holding rows instead of groups: no second read.
  expect(getEntries).toHaveBeenCalledTimes(1);
});

it('refuses to clear the last remaining condition', () => {
  render(<DuplicateScan />);
  for (const name of ['Amount', 'Category']) {
    fireEvent.click(screen.getByRole('checkbox', { name }));
  }
  const last = screen.getByRole('checkbox', { name: 'Date' });
  expect(last).toBeChecked();
  expect(last).toBeDisabled();
  // The unchecked ones stay usable, so the choice is recoverable.
  expect(screen.getByRole('checkbox', { name: 'Amount' })).not.toBeDisabled();
});
```

- [ ] **Step 2: Run the tests and confirm they fail for the right reason**

```bash
npm test -- src/features/entries/ui/DuplicateScan.test.tsx
```

Expected: FAIL. Both new cases report that no checkbox with an accessible name of `Account` / `Amount` / `Date` exists — the checkbox row has not been built yet. The eleven existing cases pass.

- [ ] **Step 3: Rewrite the state and add the checkbox row**

In `src/features/entries/ui/DuplicateScan.tsx`:

**3a.** Extend the React import and the `duplicates` import at the top of the file:

```tsx
import { useMemo, useState } from 'react';
```

```tsx
import {
  findDuplicateGroups,
  DUPLICATE_FIELDS,
  DEFAULT_DUPLICATE_FIELDS,
  type DuplicateField,
} from '../duplicates';
```

**3b.** Add this above the `DuplicateScan` function, next to `rowDeleteLabel`:

```tsx
// Sentence-case, one word each: these read as a row of conditions, not as form fields.
const FIELD_LABELS = {
  date: 'Date',
  amount: 'Amount',
  category: 'Category',
  account: 'Account',
  note: 'Note',
} satisfies Record<DuplicateField, string>;
```

**3c.** Replace the `groups` state declaration

```tsx
const [groups, setGroups] = useState<EntryRow[][] | null>(null);
```

with the rows state, the field state, and the derived groups:

```tsx
// The scanned rows, not the groups derived from them. Grouping is a pure function of these rows and
// the chosen fields, so changing a condition re-groups in memory instead of re-reading ten thousand
// rows over the worker RPC. It also removes a synchronisation duty: `groups` and the ledger drifting
// apart after an undo is exactly the defect fixed in v1.25.0.
//
// `null` still means "not scanned" and `[]` still means "scanned and clean" — collapsing those two
// would make the empty state indistinguishable from the initial one, and the whole value of the
// surface is the sentence "No duplicates found".
const [rows, setRows] = useState<EntryRow[] | null>(null);
// Not persisted. The scan is a rare, deliberate act and the default reproduces the rule the page
// shipped with, which is the right thing to land on each visit.
const [fields, setFields] = useState<readonly DuplicateField[]>(DEFAULT_DUPLICATE_FIELDS);
const groups = useMemo(
  () => (rows === null ? null : findDuplicateGroups(rows, fields)),
  [rows, fields],
);
```

**3d.** In `scan()`, replace

```tsx
setGroups(findDuplicateGroups(rows));
```

with

```tsx
setRows(await getEntries(db));
```

and delete the now-unused `const rows = await getEntries(db);` line above it, so the body of the `withDb` callback reads:

```tsx
void withDb(async (db) => {
  setRows(await getEntries(db));
}).finally(() => setScanning(false));
```

**3e.** In `remove()`, replace the `setGroups` block

```tsx
setGroups((current) => {
  if (current === null) return current;
  const remaining = current.flat().filter((row) => row.id !== entry.id);
  return findDuplicateGroups(remaining);
});
```

with

```tsx
// Drop the row and let the memo re-derive. Every other row's group membership is unaffected by one
// deletion, so this is exactly what a second read would produce.
setRows((current) => (current === null ? current : current.filter((row) => row.id !== entry.id)));
```

The comment block above `remove()` mentions re-running the scan "over the rows already on screen"; leave that comment's Undo reasoning intact but make sure nothing in it still claims groups are recomputed by hand.

**3f.** Add the checkbox row as the first child of the returned `<div className="flex flex-col gap-3">`, immediately above the Scan button:

```tsx
<fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
  <legend className="pb-1 text-sm font-semibold">Must match</legend>
  {DUPLICATE_FIELDS.map((field) => {
    const checked = fields.includes(field);
    return (
      <label key={field} className="tap flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={checked}
          // The last checked box can't be cleared: with nothing to key on every row shares a key and
          // the whole ledger would read as one duplicate group.
          disabled={checked && fields.length === 1}
          onChange={(e) => {
            const next = e.currentTarget.checked;
            // Rebuild from DUPLICATE_FIELDS so the list stays in its canonical order however it was
            // toggled — the key is built in this order, and a stable order keeps it readable.
            setFields(DUPLICATE_FIELDS.filter((f) => (f === field ? next : fields.includes(f))));
          }}
        />
        {FIELD_LABELS[field]}
      </label>
    );
  })}
</fieldset>
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test -- src/features/entries/ui/DuplicateScan.test.tsx
```

Expected: PASS, 13 tests — the eleven that existed plus the two added in Step 1.

- [ ] **Step 5: Update the Checkup page header**

In `src/app/checkup/page.tsx`, replace the `<p>` in the header:

```tsx
<p className="text-sm" style={{ color: 'var(--color-muted)' }}>
  Rows sharing a date, an amount and a category. Three things write to the ledger and none of
  them checks the others.
</p>
```

with:

```tsx
<p className="text-sm" style={{ color: 'var(--color-muted)' }}>
  Rows the ledger holds more than once. Three things write to it and none of them checks the
  others. Choose below what has to match.
</p>
```

The sentence must not name specific fields — the checkboxes state the current rule, and a header that repeats one of them goes stale the moment it is changed. Update the block comment above the component too: it says "One check today", which is still true, but nothing in it should describe the fixed rule.

- [ ] **Step 6: Run the gates**

```bash
npm run format:files src/features/entries/ui/DuplicateScan.tsx src/features/entries/ui/DuplicateScan.test.tsx src/app/checkup/page.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all pass. Watch for an unused-import lint error on `EntryRow` in `DuplicateScan.tsx` — it is still used by `rowDeleteLabel` and `remove`, so it should stay.

- [ ] **Step 7: Commit**

```bash
git add src/features/entries/ui/DuplicateScan.tsx src/features/entries/ui/DuplicateScan.test.tsx src/app/checkup/page.tsx
git commit -m "feat(features): pick the Checkup duplicate conditions on the page" -m "A row of checkboxes above the Scan button chooses which fields must match, defaulting to the date+amount+category rule the page shipped with. The last checked box cannot be cleared, since with nothing to key on the whole ledger reads as one duplicate group." -m "The component now holds the scanned rows and derives groups with useMemo instead of storing the groups. Changing a condition re-groups in memory rather than re-reading ten thousand rows over the worker RPC, and deleting a row becomes a filter over rows instead of a hand-written re-derivation."
```

---

### Task 4: Verify in a real browser

The suite runs under jsdom against the Node shim. It proves the queries, the pure logic and component render, and none of the WASM worker, OPFS, the service worker, or real layout. A UI change is not done here until it has been driven at 412px.

**Files:** none — this task changes no code unless it finds a defect.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev:web
```

It serves `127.0.0.1:4010`. Note that `localhost:4010` is a **different origin** with its own empty OPFS database — use the `127.0.0.1` form or the ledger will look empty.

- [ ] **Step 2: Check the More sheet at 412px**

Open `http://127.0.0.1:4010/`, set the viewport to 412px wide, and tap the More tab.

Confirm: four captions read Lists / Review / Plan / App; Lists and App each fill one row of three; the sheet still fits without scrolling. Then step the cycle back on Home, reopen the sheet, tap Budgets, and confirm the URL carries `?cycle=`.

- [ ] **Step 3: Check the Checkup conditions**

Open `http://127.0.0.1:4010/checkup`.

Confirm, in order:

1. Date, Amount and Category start checked; Account and Note start unchecked.
2. Press Scan. The group count matches what the page reported before this change — this ledger has previously produced 137 duplicate rows, so expect that order of magnitude, not a handful and not thousands.
3. Tick Account. The list re-groups instantly with no visible reload, and the count drops or stays equal — never rises.
4. Untick Amount and Category. The Date box goes disabled and cannot be cleared.
5. Untick Date is impossible; tick Amount again and confirm Date becomes clearable.

- [ ] **Step 4: Report what you saw**

Report the actual duplicate counts under the default rule and with Account ticked. If anything differs from the expectations above, stop and report rather than patching around it.

**Do not delete rows on this ledger to test the Delete path.** It holds real financial data. The delete and undo paths are covered by the existing component tests, and the Undo re-scan path was verified when `/checkup` shipped in v1.25.0.

---

## Definition of Done

- [ ] All three code tasks committed on `feat/more-regroup-checkup-conditions`
- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` all green
- [ ] Browser verification at 412px reported, with the two duplicate counts
- [ ] No `Co-Authored-By:` or `Claude-Session:` trailer on any commit
