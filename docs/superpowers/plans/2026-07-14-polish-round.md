# Polish Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four independent polish changes — card-fee default 2→2.5%, budget amount grouped-on-blur, app-wide save toasts, and a categories/accounts JSON export+restore.

**Architecture:** All mutations are plain client async functions (`features/*/actions.ts`). Toasts use the existing module-level `toast()` store + layout-mounted `ToastRegion` (persists across navigation). The catalog JSON mirrors the existing entries-CSV `exportBackup`/`ImportBackup` precedent. No new dependencies.

**Tech Stack:** Next.js 16 App Router (static export), React 19, TS 5.9 strict, Drizzle + sqlite-proxy (OPFS/node-proxy), Vitest + @testing-library/react, Intl.NumberFormat.

## Global Constraints

- TS strict: **no `any`/`as`/`!`/`@ts-*`**; `type` over `interface`; `for..of`; `as const`/`satisfies` for typed config. Formatting via `Intl`, never string hacks.
- Quality gates before each commit: `npm run format:files <changed>` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test`. All pass. Commit with repeated `-m` flags.
- Subagents run shell via **Git Bash (POSIX)**, not PowerShell.
- **Toast messages (exact copy):** settings forms `Saved`; budget `Budget set` / `Budget removed`; category `Category added` / `Category saved` / `Category deleted` / `Category updated`; account `Account added` / `Account saved` / `Account deleted` / `Account updated`; entries `Entry saved` / `Entry deleted`. (Rename and merge share one action → one message: `Category saved` / `Account saved`.)
- **Skip (already toast):** `AccountMergeButton`, `TripRename`, `WipeAllData`. **Skip (too noisy):** drag-reorder.
- **Catalog restore is upsert-by-name — NEVER deletes** unlisted rows. **No confirm dialog** (non-destructive).
- Catalog percentages/amounts n/a; catalog JSON `version: 1`.

## File structure

- `src/features/settings/queries.ts` (modify) — fee default.
- `src/features/budgets/use-budget-input.ts` (modify) + `.test.ts` — separator-tolerant commit + `formatBudgetAmount`.
- `src/features/budgets/ui/BudgetField.tsx` (modify) — text input + grouped display.
- `src/shared/ui/with-save-toast.ts` (create) + `.test.ts` — the action wrapper.
- Toast application across `settings/page.tsx`, `BudgetField.tsx`, `entries/{new,edit}/page.tsx`, `SwipeRow.tsx`, and the categories/accounts editor components.
- `src/features/settings/catalog.ts` (create) + `.test.ts` — pure serialize/parse.
- `src/features/categories/queries.ts` + `src/features/accounts/queries.ts` (modify) + tests — catalog read + upsert-restore.
- `src/features/settings/ui/ImportCatalog.tsx` (create) + `src/app/settings/page.tsx` (modify) — export/import UI.

---

## Task 1: Card FX fee default → 2.5%

**Files:**
- Modify: `src/features/settings/queries.ts` (the `DEFAULT_CARD_FEE` const + comment, ~line 62-63)
- Test: `src/features/settings/queries.test.ts` (the two card-fee default assertions)

**Interfaces:** none new — only the default value changes.

- [ ] **Step 1: Update the failing tests**

In `src/features/settings/queries.test.ts`, change the card-fee default assertions from `2` to `2.5`:

```ts
// in 'defaults to 2 when nothing is stored' — rename + update:
it('defaults to 2.5 when nothing is stored', async () => {
  const db = makeNodeProxyDb();
  await ensureSettingsTable(db);
  expect(await getCardFeePct(db)).toBe(2.5);
});
// in 'falls back to 2 if the stored value is out of range' — update the expectation:
  expect(await getCardFeePct(db)).toBe(2.5);
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/features/settings/queries.test.ts`
Expected: FAIL — default still returns `2`.

- [ ] **Step 3: Change the default**

In `src/features/settings/queries.ts`:

```ts
const CARD_FEE_KEY = 'card_fx_fee_pct';
const DEFAULT_CARD_FEE = 2.5;
```

Update the neighboring comment `Default 2%.` → `Default 2.5%.`.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/features/settings/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/settings/queries.ts src/features/settings/queries.test.ts
npm run typecheck && npm run lint && npm test -- src/features/settings/queries.test.ts
git add src/features/settings/queries.ts src/features/settings/queries.test.ts
git commit -m "feat(settings): default card FX fee to 2.5%" -m "Raises the fresh-DB default markup over the ECB mid-rate from 2% to 2.5%. Stored values are unaffected; only the unset default moves."
```

---

## Task 2: Budget amount grouped-on-blur

**Files:**
- Modify: `src/features/budgets/use-budget-input.ts`
- Modify: `src/features/budgets/use-budget-input.test.ts`
- Modify: `src/features/budgets/ui/BudgetField.tsx`

**Interfaces:**
- Produces: `formatBudgetAmount(raw: string): string` (pure; exported from `use-budget-input.ts`) — `''`→`''`, a finite number → grouped (`Intl.NumberFormat('en-US')`), otherwise the trimmed input unchanged. `useBudgetInput`'s `commit` now strips grouping commas before parsing.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/budgets/use-budget-input.test.ts` (import `formatBudgetAmount` alongside the existing `useBudgetInput` import):

```ts
import { useBudgetInput, formatBudgetAmount } from './use-budget-input';

describe('formatBudgetAmount', () => {
  it('groups thousands, passes through blank and non-numeric', () => {
    expect(formatBudgetAmount('')).toBe('');
    expect(formatBudgetAmount('  ')).toBe('');
    expect(formatBudgetAmount('30000')).toBe('30,000');
    expect(formatBudgetAmount('30,000')).toBe('30,000');
    expect(formatBudgetAmount('abc')).toBe('abc');
  });
});

describe('useBudgetInput commit tolerates grouping', () => {
  it('commits a grouped string as its numeric value and no-ops on re-blur', () => {
    const saved: number[] = [];
    const { result } = renderHook(() => useBudgetInput(undefined, (n) => saved.push(n)));
    result.current.onBlur({ currentTarget: { value: '30,000' } });
    expect(saved).toEqual([30000]);
    result.current.onBlur({ currentTarget: { value: '30,000' } }); // unchanged → no second write
    expect(saved).toEqual([30000]);
  });
});
```

(The existing test file already imports `renderHook`; if not, add `import { renderHook } from '@testing-library/react';`.)

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/features/budgets/use-budget-input.test.ts`
Expected: FAIL — `formatBudgetAmount` not exported; grouped `'30,000'` currently parses to `NaN` and is dropped (nothing pushed).

- [ ] **Step 3: Implement**

In `src/features/budgets/use-budget-input.ts`, change `commit` to strip commas before parsing, and add the formatter:

```ts
const amount = Number(trimmed.replace(/,/g, '')); // tolerate grouped input (e.g. "30,000")
```

Add at module scope:

```ts
// Group a raw budget string for display (grouped thousands, no ฿ — the field carries .tnum). Blank
// stays blank; anything non-numeric passes through unchanged so a mid-edit value isn't mangled.
const budgetFmt = new Intl.NumberFormat('en-US');
export function formatBudgetAmount(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const n = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(n) ? budgetFmt.format(n) : trimmed;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/features/budgets/use-budget-input.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into BudgetField**

In `src/features/budgets/ui/BudgetField.tsx`:
- Import the formatter: `import { useBudgetInput, formatBudgetAmount } from '../use-budget-input';`
- Change the input from `type="number" … min="0" step="1"` to `type="text" inputMode="numeric"` (drop `min`/`step` — not valid on text; the hook already rejects negatives/non-numeric).
- `defaultValue={prefill}` → `defaultValue={formatBudgetAmount(prefill)}`.
- Compose blur so it commits (hook) then reformats the field, and select-all on focus:

```tsx
const { onBlur, onKeyDown } = useBudgetInput(amount, (next) =>
  startTransition(async () => {
    await saveBudget(category, next);
    router.refresh();
  }),
);
```

```tsx
<input
  type="text"
  inputMode="numeric"
  defaultValue={formatBudgetAmount(prefill)}
  onFocus={(e) => e.currentTarget.select()}
  onBlur={(e) => {
    onBlur(e);
    e.currentTarget.value = formatBudgetAmount(e.currentTarget.value);
  }}
  onKeyDown={onKeyDown}
  placeholder={placeholder}
  aria-label={category ? `${category} monthly limit` : 'Total monthly limit'}
  className="tnum min-h-11 w-24 rounded-[var(--radius-md)] px-3 text-center text-base transition-opacity placeholder:[color:var(--color-muted)]"
  style={{
    border: '1px solid var(--color-border-strong)',
    background: 'var(--color-surface-2)',
    color: 'var(--color-text)',
    opacity: pending ? 0.55 : 1,
  }}
/>
```

- [ ] **Step 6: Verify + commit**

Run: `npm run typecheck && npm run lint && npm test -- src/features/budgets/`
Expected: PASS.

```bash
npm run format:files src/features/budgets/use-budget-input.ts src/features/budgets/use-budget-input.test.ts src/features/budgets/ui/BudgetField.tsx
npm run typecheck && npm run lint && npm test
git add src/features/budgets/use-budget-input.ts src/features/budgets/use-budget-input.test.ts src/features/budgets/ui/BudgetField.tsx
git commit -m "feat(budgets): show grouped thousands in the budget field" -m "Switches the amount input to a text field and displays the value grouped (e.g. 30,000) on blur; commit tolerates the grouping separators. Auto-save-on-blur behavior is unchanged."
```

---

## Task 3: `withSaveToast` helper

**Files:**
- Create: `src/shared/ui/with-save-toast.ts`
- Create: `src/shared/ui/with-save-toast.test.ts`

**Interfaces:**
- Produces: `withSaveToast<A extends unknown[]>(action: (...a: A) => Promise<void>, message?: string): (...a: A) => Promise<void>` — awaits the action, then `toast(message)` (default `'Saved'`); on throw, `toast.error("Couldn't save — try again")` then rethrows.

- [ ] **Step 1: Write the failing test**

Create `src/shared/ui/with-save-toast.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getToasts, resetToasts } from './toast';
import { withSaveToast } from './with-save-toast';

describe('withSaveToast', () => {
  beforeEach(() => resetToasts());

  it('runs the action then shows a success toast', async () => {
    let ran = false;
    await withSaveToast(async () => {
      ran = true;
    }, 'Budget set')();
    expect(ran).toBe(true);
    const toasts = getToasts();
    expect(toasts.at(-1)?.message).toBe('Budget set');
    expect(toasts.at(-1)?.tone).toBe('polite');
  });

  it('defaults the message to "Saved"', async () => {
    await withSaveToast(async () => {})();
    expect(getToasts().at(-1)?.message).toBe('Saved');
  });

  it('shows an error toast and rethrows when the action fails', async () => {
    const boom = withSaveToast(async () => {
      throw new Error('nope');
    });
    await expect(boom()).rejects.toThrow('nope');
    const last = getToasts().at(-1);
    expect(last?.tone).toBe('assertive');
    expect(last?.message).toContain('save');
  });

  it('passes arguments through to the wrapped action', async () => {
    const seen: unknown[] = [];
    await withSaveToast(async (a: string, b: number) => {
      seen.push(a, b);
    })('x', 2);
    expect(seen).toEqual(['x', 2]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/shared/ui/with-save-toast.test.ts`
Expected: FAIL — module/export missing.

- [ ] **Step 3: Implement**

Create `src/shared/ui/with-save-toast.ts`:

```ts
import { toast } from './toast';

// Wrap a mutation (a client action returning Promise<void>) so a successful run shows a confirmation
// toast, and a failure shows an error toast and rethrows (preserving existing pending-state / error
// behavior). Used directly as a React form `action` prop: `action={withSaveToast(setCutoffAction)}`.
export function withSaveToast<A extends unknown[]>(
  action: (...args: A) => Promise<void>,
  message = 'Saved',
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await action(...args);
      toast(message);
    } catch (e) {
      toast.error('Couldn’t save — try again');
      throw e;
    }
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/shared/ui/with-save-toast.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/shared/ui/with-save-toast.ts src/shared/ui/with-save-toast.test.ts
npm run typecheck && npm run lint && npm test -- src/shared/ui/with-save-toast.test.ts
git add src/shared/ui/with-save-toast.ts src/shared/ui/with-save-toast.test.ts
git commit -m "feat(shared): add withSaveToast action wrapper" -m "Wraps a client mutation so success shows a confirmation toast and failure shows an error toast and rethrows. The building block for app-wide save feedback."
```

---

## Task 4: Apply toasts — settings, budgets, entries

**Files:**
- Modify: `src/app/settings/page.tsx` (4 form actions)
- Modify: `src/features/budgets/ui/BudgetField.tsx` (2 imperative)
- Modify: `src/app/entries/new/page.tsx` and `src/app/entries/edit/page.tsx` (imperative handleSubmit)
- Modify: `src/features/entries/ui/SwipeRow.tsx` (1 form action)

**Interfaces:** Consumes `withSaveToast` (Task 3) and `toast` (`@shared/ui/toast`).

No new unit tests — these are UI wirings; the gate is the whole suite staying green + the later live verification. `withSaveToast` is unit-tested in Task 3.

- [ ] **Step 1: Settings — wrap the 4 form actions**

In `src/app/settings/page.tsx`, add `import { withSaveToast } from '@shared/ui/with-save-toast';`, then wrap each form action:

```tsx
<form action={withSaveToast(setCutoffAction)} className="flex flex-col gap-3">
```
```tsx
<form action={withSaveToast(setIconSetAction)} className="flex flex-col gap-3">
```
```tsx
<form action={withSaveToast(setFontScaleAction)} className="flex flex-col gap-3">
```
```tsx
<form action={withSaveToast(setCardFeePctAction)} className="flex flex-col gap-3">
```

(Default `'Saved'` message for all four.)

- [ ] **Step 2: BudgetField — toast after each imperative mutation**

In `src/features/budgets/ui/BudgetField.tsx`, add `import { toast } from '@shared/ui/toast';`, then add a toast after each awaited call:

```tsx
startTransition(async () => {
  await saveBudget(category, next);
  toast('Budget set');
  router.refresh();
}),
```
```tsx
startTransition(async () => {
  await removeBudget(category);
  toast('Budget removed');
  router.refresh();
})
```

- [ ] **Step 3: Entry add/edit — toast in the page handleSubmit**

In `src/app/entries/new/page.tsx`, add `import { toast } from '@shared/ui/toast';` and:

```tsx
async function handleSubmit(formData: FormData): Promise<void> {
  await addEntryAction(formData);
  toast('Entry saved'); // module-level store + layout ToastRegion persist across the navigation
  router.push('/');
}
```

In `src/app/entries/edit/page.tsx`, same import and:

```tsx
async function handleSubmit(formData: FormData): Promise<void> {
  await editEntryAction(formData);
  toast('Entry saved');
  router.push('/records');
}
```

- [ ] **Step 4: SwipeRow — wrap the delete form action**

In `src/features/entries/ui/SwipeRow.tsx`, add `import { withSaveToast } from '@shared/ui/with-save-toast';` and wrap:

```tsx
<form action={withSaveToast(deleteEntryAction, 'Entry deleted')} …>
```

(Keep every other prop on the form unchanged.)

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS (whole suite green; no behavior regressed).

```bash
npm run format:files src/app/settings/page.tsx src/features/budgets/ui/BudgetField.tsx src/app/entries/new/page.tsx src/app/entries/edit/page.tsx src/features/entries/ui/SwipeRow.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/settings/page.tsx src/features/budgets/ui/BudgetField.tsx src/app/entries/new/page.tsx src/app/entries/edit/page.tsx src/features/entries/ui/SwipeRow.tsx
git commit -m "feat(app): toast on save across settings, budgets, entries" -m "Settings' four forms and the entry-delete form wrap their action in withSaveToast; budget set/remove and entry add/edit toast after their awaited mutation. Entry add/edit toast before router.push — the module-level toast store + layout ToastRegion survive the navigation."
```

---

## Task 5: Apply toasts — categories & accounts

**Files:**
- Modify: `src/features/categories/ui/AddCategory.tsx`, `CategoryNameEditor.tsx`, `DeleteCategoryButton.tsx`, `CategoryPickerDialog.tsx`
- Modify: `src/features/accounts/ui/AddAccount.tsx`, `AccountNameEditor.tsx`, `DeleteAccountButton.tsx`, `AccountIconPicker.tsx`

**Interfaces:** Consumes `withSaveToast` (Task 3).

All eight are form-action (type A) sites → wrap the `action` prop. **Do NOT touch** `AccountMergeButton.tsx` or `TripRename.tsx` (already toast). Add `import { withSaveToast } from '@shared/ui/with-save-toast';` to each file.

No new unit tests (UI wiring); gate is whole-suite-green.

- [ ] **Step 1: Categories**

| File | form action → wrap | message |
|---|---|---|
| `AddCategory.tsx` | `action={withSaveToast(addCategoryAction, 'Category added')}` | Category added |
| `CategoryNameEditor.tsx` | `action={withSaveToast(mergeCategoryAction, 'Category saved')}` | Category saved (rename+merge share this action) |
| `DeleteCategoryButton.tsx` | `action={withSaveToast(deleteCategoryAction, 'Category deleted')}` | Category deleted |
| `CategoryPickerDialog.tsx` (2 forms) | `action={withSaveToast(setCategoryEmojiAction, 'Category updated')}` and `action={withSaveToast(setCategoryHueAction, 'Category updated')}` | Category updated |

Keep the existing `onSubmit={close}` / guard props on each form unchanged — only the `action` prop is wrapped.

- [ ] **Step 2: Accounts**

| File | form action → wrap | message |
|---|---|---|
| `AddAccount.tsx` | `action={withSaveToast(addAccountAction, 'Account added')}` | Account added |
| `AccountNameEditor.tsx` | `action={withSaveToast(mergeAccountAction, 'Account saved')}` | Account saved |
| `DeleteAccountButton.tsx` | `action={withSaveToast(deleteAccountAction, 'Account deleted')}` | Account deleted |
| `AccountIconPicker.tsx` (2 forms) | `action={withSaveToast(setAccountIconAction, 'Account updated')}` and `action={withSaveToast(setAccountHueAction, 'Account updated')}` | Account updated |

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

```bash
npm run format:files src/features/categories/ui/AddCategory.tsx src/features/categories/ui/CategoryNameEditor.tsx src/features/categories/ui/DeleteCategoryButton.tsx src/features/categories/ui/CategoryPickerDialog.tsx src/features/accounts/ui/AddAccount.tsx src/features/accounts/ui/AccountNameEditor.tsx src/features/accounts/ui/DeleteAccountButton.tsx src/features/accounts/ui/AccountIconPicker.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/categories/ui/*.tsx src/features/accounts/ui/*.tsx
git commit -m "feat(features): toast on category & account changes" -m "Add/rename/merge/delete and icon/color saves across categories and accounts wrap their form action in withSaveToast. AccountMergeButton and TripRename already have their own toasts and are left untouched."
```

---

## Task 6: Catalog serialize/parse (pure)

**Files:**
- Create: `src/features/settings/catalog.ts`
- Create: `src/features/settings/catalog.test.ts`

**Interfaces:**
- Produces:
  - `type CatalogData = { version: 1; categories: { name: string; emoji: string; hue: number | null; sortOrder: number | null; archived: boolean }[]; accounts: { name: string; icon: string; hue: number | null; sortOrder: number | null }[] }`
  - `serializeCatalogJson(data: CatalogData): string`
  - `parseCatalogJson(text: string): CatalogData | null` (returns `null` on malformed/wrong-version input)

- [ ] **Step 1: Write the failing test**

Create `src/features/settings/catalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeCatalogJson, parseCatalogJson, type CatalogData } from './catalog';

const sample: CatalogData = {
  version: 1,
  categories: [{ name: 'Food', emoji: '🍔', hue: 12, sortOrder: 0, archived: false }],
  accounts: [{ name: 'Cash', icon: 'cash', hue: null, sortOrder: 1 }],
};

describe('catalog serialize/parse', () => {
  it('round-trips a catalog', () => {
    expect(parseCatalogJson(serializeCatalogJson(sample))).toEqual(sample);
  });

  it('returns null on non-JSON', () => {
    expect(parseCatalogJson('not json')).toBeNull();
  });

  it('returns null on wrong/absent version', () => {
    expect(parseCatalogJson(JSON.stringify({ version: 2, categories: [], accounts: [] }))).toBeNull();
    expect(parseCatalogJson(JSON.stringify({ categories: [], accounts: [] }))).toBeNull();
  });

  it('returns null when a category row is malformed', () => {
    const bad = JSON.stringify({ version: 1, categories: [{ name: 'X' }], accounts: [] });
    expect(parseCatalogJson(bad)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/features/settings/catalog.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/features/settings/catalog.ts`:

```ts
// Supplementary JSON backup for the display metadata the entries CSV can't carry — category
// emoji/hue/order/archived and account icon/hue/order, plus zero-entry rows. Pure: no DB, no fs, so
// it's unit-testable; the settings page composes the DB reads and the download around it.
export type CategoryCatalogRow = {
  name: string;
  emoji: string;
  hue: number | null;
  sortOrder: number | null;
  archived: boolean;
};
export type AccountCatalogRow = {
  name: string;
  icon: string;
  hue: number | null;
  sortOrder: number | null;
};
export type CatalogData = {
  version: 1;
  categories: CategoryCatalogRow[];
  accounts: AccountCatalogRow[];
};

export function serializeCatalogJson(data: CatalogData): string {
  return JSON.stringify(data, null, 2);
}

function isNumOrNull(v: unknown): v is number | null {
  return v === null || typeof v === 'number';
}
function isCategoryRow(v: unknown): v is CategoryCatalogRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'name' in v &&
    typeof v.name === 'string' &&
    'emoji' in v &&
    typeof v.emoji === 'string' &&
    'hue' in v &&
    isNumOrNull(v.hue) &&
    'sortOrder' in v &&
    isNumOrNull(v.sortOrder) &&
    'archived' in v &&
    typeof v.archived === 'boolean'
  );
}
function isAccountRow(v: unknown): v is AccountCatalogRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'name' in v &&
    typeof v.name === 'string' &&
    'icon' in v &&
    typeof v.icon === 'string' &&
    'hue' in v &&
    isNumOrNull(v.hue) &&
    'sortOrder' in v &&
    isNumOrNull(v.sortOrder)
  );
}

export function parseCatalogJson(text: string): CatalogData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (!('version' in parsed) || parsed.version !== 1) return null;
  if (!('categories' in parsed) || !Array.isArray(parsed.categories)) return null;
  if (!('accounts' in parsed) || !Array.isArray(parsed.accounts)) return null;
  if (!parsed.categories.every(isCategoryRow)) return null;
  if (!parsed.accounts.every(isAccountRow)) return null;
  return { version: 1, categories: parsed.categories, accounts: parsed.accounts };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/features/settings/catalog.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/settings/catalog.ts src/features/settings/catalog.test.ts
npm run typecheck && npm run lint && npm test -- src/features/settings/catalog.test.ts
git add src/features/settings/catalog.ts src/features/settings/catalog.test.ts
git commit -m "feat(settings): add catalog JSON serialize/parse" -m "Pure, validated serialize/parse for a version:1 categories+accounts metadata backup (emoji/hue/order/archived, icon/hue/order). Guards reject non-JSON, wrong version, and malformed rows."
```

---

## Task 7: Catalog read + restore queries

**Files:**
- Modify: `src/features/categories/queries.ts` + `src/features/categories/queries.test.ts`
- Modify: `src/features/accounts/queries.ts` + `src/features/accounts/queries.test.ts`

**Interfaces:**
- Consumes: `CategoryCatalogRow`, `AccountCatalogRow` (Task 6).
- Produces:
  - `getCategoryCatalog(db): Promise<CategoryCatalogRow[]>` (ordered by name)
  - `restoreCategoryCatalog(db, rows: CategoryCatalogRow[]): Promise<void>` (upsert by name, never deletes)
  - `getAccountCatalog(db): Promise<AccountCatalogRow[]>` / `restoreAccountCatalog(db, rows: AccountCatalogRow[]): Promise<void>`

- [ ] **Step 1: Write the failing tests (categories)**

Add to `src/features/categories/queries.test.ts`:

```ts
import { getCategoryCatalog, restoreCategoryCatalog } from './queries';

describe('category catalog read/restore', () => {
  it('reads back rows and upserts by name without deleting unlisted', async () => {
    const db = makeNodeProxyDb();
    await ensureCategoriesTable(db);
    await addCategory(db, 'Keep'); // pre-existing, NOT in the restore payload
    await restoreCategoryCatalog(db, [
      { name: 'Food', emoji: '🍔', hue: 12, sortOrder: 0, archived: false },
    ]);
    await restoreCategoryCatalog(db, [
      { name: 'Food', emoji: '🍜', hue: null, sortOrder: 3, archived: true }, // updates existing
    ]);
    const rows = await getCategoryCatalog(db);
    const names = rows.map((r) => r.name);
    expect(names).toContain('Keep'); // never deleted
    const food = rows.find((r) => r.name === 'Food');
    expect(food).toEqual({ name: 'Food', emoji: '🍜', hue: null, sortOrder: 3, archived: true });
  });
});
```

(Use the table-bootstrap helper the existing tests in that file use — e.g. `ensureCategoriesTable`; match the file's existing import.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/features/categories/queries.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement (categories)**

Add to `src/features/categories/queries.ts` (import the row type: `import type { CategoryCatalogRow } from '@features/settings/catalog';`):

```ts
export async function getCategoryCatalog(db: Db): Promise<CategoryCatalogRow[]> {
  const rows = await db
    .select({
      name: categories.name,
      emoji: categories.emoji,
      hue: categories.hue,
      sortOrder: categories.sortOrder,
      archived: categories.archived,
    })
    .from(categories)
    .orderBy(categories.name)
    .all();
  return rows.map((r) => ({ ...r, archived: Boolean(r.archived) }));
}

// Upsert each row by name — updates the metadata of an existing category, inserts a missing one.
// NEVER deletes: unlisted categories may be referenced by entries. One batch.
export async function restoreCategoryCatalog(db: Db, rows: CategoryCatalogRow[]): Promise<void> {
  if (rows.length === 0) return;
  const mk = (r: CategoryCatalogRow) => {
    const archived = r.archived ? 1 : 0; // column is a raw integer flag (schema: integer, notNull default 0)
    return db
      .insert(categories)
      .values({ name: r.name, emoji: r.emoji, hue: r.hue, sortOrder: r.sortOrder, archived })
      .onConflictDoUpdate({
        target: categories.name,
        set: { emoji: r.emoji, hue: r.hue, sortOrder: r.sortOrder, archived },
      });
  };
  const [first, ...rest] = rows;
  await db.batch([mk(first), ...rest.map(mk)]);
}
```

Note: `categories.archived` is `integer('archived').notNull().default(0)` — a raw integer, so `$inferSelect.archived` is `number`. Read maps `Boolean(r.archived)` → the `CatalogData.archived: boolean`; write maps `r.archived ? 1 : 0` back to the integer column (above). No `as` needed.

- [ ] **Step 4: Run to verify pass (categories)**

Run: `npm test -- src/features/categories/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Accounts — mirror Steps 1-4**

Add the analogous test to `src/features/accounts/queries.test.ts` (pre-existing `Keep` account via `addAccount`, restore-then-update `Cash`, assert `Keep` survives and `Cash` reflects the second payload — accounts have `icon/hue/sortOrder`, no `archived`), then implement in `src/features/accounts/queries.ts`:

```ts
import type { AccountCatalogRow } from '@features/settings/catalog';

export async function getAccountCatalog(db: Db): Promise<AccountCatalogRow[]> {
  return db
    .select({
      name: accounts.name,
      icon: accounts.icon,
      hue: accounts.hue,
      sortOrder: accounts.sortOrder,
    })
    .from(accounts)
    .orderBy(accounts.name)
    .all();
}

export async function restoreAccountCatalog(db: Db, rows: AccountCatalogRow[]): Promise<void> {
  if (rows.length === 0) return;
  const mk = (r: AccountCatalogRow) =>
    db
      .insert(accounts)
      .values({ name: r.name, icon: r.icon, hue: r.hue, sortOrder: r.sortOrder })
      .onConflictDoUpdate({
        target: accounts.name,
        set: { icon: r.icon, hue: r.hue, sortOrder: r.sortOrder },
      });
  const [first, ...rest] = rows;
  await db.batch([mk(first), ...rest.map(mk)]);
}
```

Run: `npm test -- src/features/accounts/queries.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
npm run format:files src/features/categories/queries.ts src/features/categories/queries.test.ts src/features/accounts/queries.ts src/features/accounts/queries.test.ts
npm run typecheck && npm run lint && npm test -- src/features/categories/ src/features/accounts/
git add src/features/categories/queries.ts src/features/categories/queries.test.ts src/features/accounts/queries.ts src/features/accounts/queries.test.ts
git commit -m "feat(features): catalog read + upsert-restore for categories & accounts" -m "getCategoryCatalog/getAccountCatalog read the display metadata; restore* upsert by name (never delete) so a catalog import updates existing styling and adds missing rows without touching entry-referenced categories."
```

---

## Task 8: Catalog export/import UI

**Files:**
- Create: `src/features/settings/ui/ImportCatalog.tsx`
- Modify: `src/app/settings/page.tsx`

**Interfaces:** Consumes `serializeCatalogJson`/`parseCatalogJson` (Task 6), `getCategoryCatalog`/`restoreCategoryCatalog` (Task 7), `getAccountCatalog`/`restoreAccountCatalog` (Task 7), `getBrowserDb`, `bumpDataVersion`, `toast`, `todayIso`.

No new unit test (UI wiring, mirrors the untested `ImportBackup`/`exportBackup`); gate is whole-suite-green + Task 9's live verification.

- [ ] **Step 1: Export helper in the settings page**

In `src/app/settings/page.tsx`, add imports and an `exportCatalog` helper mirroring the existing `exportBackup`:

```tsx
import { getCategoryCatalog } from '@features/categories/queries';
import { getAccountCatalog } from '@features/accounts/queries';
import { serializeCatalogJson } from '@features/settings/catalog';
import { ImportCatalog } from '@features/settings/ui/ImportCatalog';
```

```tsx
async function exportCatalog(): Promise<void> {
  try {
    const db = await getBrowserDb();
    const [categories, accounts] = await Promise.all([getCategoryCatalog(db), getAccountCatalog(db)]);
    const json = serializeCatalogJson({ version: 1, categories, accounts });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moniflow-catalog-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    toast.error("Couldn't export categories & accounts — try again");
  }
}
```

Add to the **Backup** `<section>` (after the CSV controls, before/after `<ImportBackup />`):

```tsx
<button
  type="button"
  className="btn btn-ghost w-fit"
  onClick={() => {
    void exportCatalog();
  }}
>
  Export categories &amp; accounts
</button>
<ImportCatalog />
```

Update the Backup section's helper `<p>` to mention the JSON covers category/account styling.

- [ ] **Step 2: ImportCatalog component**

Create `src/features/settings/ui/ImportCatalog.tsx` (mirror `ImportBackup`, but non-destructive → no ConfirmDialog):

```tsx
'use client';

import { useRef, type ChangeEvent } from 'react';
import { getBrowserDb } from '@db/browser';
import { parseCatalogJson } from '@features/settings/catalog';
import { restoreCategoryCatalog } from '@features/categories/queries';
import { restoreAccountCatalog } from '@features/accounts/queries';
import { bumpDataVersion } from '@shared/data-version';
import { toast } from '@shared/ui/toast';

// Restore category/account display metadata (emoji/hue/order/archived, icon/hue/order) from the
// JSON that "Export categories & accounts" produced. Upsert-by-name (never deletes), so no destructive
// confirm — unlike the replace-all CSV restore. Read in the browser (file.text()), applied to OPFS.
export function ImportCatalog() {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const data = parseCatalogJson(await file.text());
    if (data === null) {
      toast.error("Couldn't read that file — is it a moniflow catalog JSON?");
      return;
    }
    try {
      const db = await getBrowserDb();
      await restoreCategoryCatalog(db, data.categories);
      await restoreAccountCatalog(db, data.accounts);
      bumpDataVersion();
      toast('Categories & accounts restored');
    } catch {
      toast.error("Couldn't restore categories & accounts — try again");
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost w-fit" onClick={() => inputRef.current?.click()}>
        Restore categories &amp; accounts
      </button>
      <input
        ref={inputRef}
        data-testid="catalog-file"
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          void handleFile(e);
        }}
      />
    </>
  );
}
```

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck && npm run lint && npm run build:web && npm test`
Expected: PASS (including the static-export build).

```bash
npm run format:files src/features/settings/ui/ImportCatalog.tsx src/app/settings/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/settings/ui/ImportCatalog.tsx src/app/settings/page.tsx
git commit -m "feat(settings): export & restore categories/accounts JSON" -m "Adds an 'Export categories & accounts' download (moniflow-catalog-<date>.json) and a non-destructive restore (upsert by name) beside the CSV backup controls. Preserves emoji/hue/order/icons that the entries CSV can't carry."
```

---

## Task 9: Live verification (controller)

After Task 8, the controller drives the app in a real browser (Playwright on `dev:web`) to verify the wired behavior the unit tests can't:

1. **Toasts:** save each Settings form → "Saved"; set a budget → "Budget set", clear it → "Budget removed"; add/rename/delete a category and an account → correct messages; add & edit an entry → "Entry saved" (toast survives the navigation to `/` and `/records`); delete an entry → "Entry deleted". Confirm the already-toasting sites (account merge, trip rename, wipe) still fire exactly one toast.
2. **Budget format:** type `30000` in a budget field, blur → shows `30,000`; re-open → still grouped; the saved amount is correct.
3. **Catalog:** style a category (emoji+color) and an account (icon), Export categories & accounts → a JSON downloads; change the styling; Restore from the JSON → styling reverts, a toast fires, and a category NOT in the file is untouched (upsert-never-delete).
4. Card fee: a fresh/unset DB shows 2.5 as the card-fee default.

Fix any defect found (small fixes inline; larger ones as a follow-up task), then the whole-branch review.

---

## Self-review

**Spec coverage:**
- #1 fee default → Task 1. ✅
- #2 toasts → Task 3 (helper) + Task 4 (settings/budgets/entries) + Task 5 (categories/accounts); exclusions honored (AccountMergeButton/TripRename/WipeAllData untouched; no reorder toasts). ✅
- #3 budget grouped-on-blur → Task 2. ✅
- #4 catalog export+restore → Task 6 (pure) + Task 7 (queries) + Task 8 (UI). ✅
- Live verification → Task 9. ✅

**Placeholder scan:** none — every code step shows complete content. The toast-application tasks give the exact wrap/insert + message per site (mechanical one-liners over files the implementer reads).

**Type consistency:** `withSaveToast`, `CatalogData`/`CategoryCatalogRow`/`AccountCatalogRow`, `serializeCatalogJson`/`parseCatalogJson`, `getCategoryCatalog`/`restoreCategoryCatalog`/`getAccountCatalog`/`restoreAccountCatalog`, `formatBudgetAmount` — consistent across Tasks 2-8.

**Resolved:** `categories.archived` is a raw integer flag (`integer('archived').notNull().default(0)`, verified) — Task 7 reads it as `Boolean(r.archived)` and writes it as `r.archived ? 1 : 0`, no `as`. Accounts have no `archived` column.
