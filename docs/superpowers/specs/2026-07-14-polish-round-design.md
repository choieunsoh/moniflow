# Polish round — design (toasts, budget format, fee default, catalog export)

**Date:** 2026-07-14
**Status:** approved, ready for planning

Four independent changes, one small "polish round" on the shipped app. Each is its own
commit(s). Local-first Next.js 16 (static export) + OPFS SQLite; all mutations are plain
client async functions (`features/*/actions.ts` — the `'use server'` matches are comments
explaining why they're NOT server actions).

---

## 1 · Card FX fee default → 2.5%  (trivial)

`DEFAULT_CARD_FEE = 2` → `2.5` in `src/features/settings/queries.ts` (and its `Default 2%`
comment). Update the `queries.test.ts` cases that assert the default is `2` → `2.5`
(`getCardFeePct` default; the out-of-range fallback). `isValidCardFeePct` (0..10) already
admits 2.5. Existing DBs that stored a value are unaffected — only the fresh/unset default moves.

---

## 2 · Save toasts on all persisted changes

There is **no success toast anywhere today** (only an error toast on a failed CSV export).
Add a confirmation toast on every successful mutation, using the existing module-level
`toast()` store (`src/shared/ui/toast.ts`) and the mounted `ToastRegion`.

**Helper** — `src/shared/ui/with-save-toast.ts`:

```ts
export function withSaveToast<A extends unknown[]>(
  action: (...args: A) => Promise<void>,
  message = 'Saved',
): (...args: A) => Promise<void> {
  return async (...args) => {
    try {
      await action(...args);
      toast(message);
    } catch (e) {
      toast.error('Couldn’t save — try again');
      throw e; // preserve existing error behavior (pending state, boundaries)
    }
  };
}
```

- **Form-action sites** wrap the action: `<form action={withSaveToast(setCutoffAction)}>`.
- **Imperative sites** add one line — `toast('…')` immediately after the awaited mutation
  (inside the existing `startTransition`/handler), since there's no form action to wrap.

**Sites + messages** (verb per site):

| Area | Site | Message |
|---|---|---|
| Settings | 4 forms (cutoff, icon set, card fee, text size) | `Saved` (via `withSaveToast`) |
| Budgets | `BudgetField` saveBudget / removeBudget | `Budget set` / `Budget removed` |
| Categories | AddCategory / CategoryNameEditor (rename) / (merge) / DeleteCategoryButton / CategoryPickerDialog (icon+color save) | `Category added` / `Category renamed` / `Categories merged` / `Category deleted` / `Category updated` |
| Accounts | AddAccount / AccountNameEditor / AccountMergeButton / DeleteAccountButton / AccountIconPicker (save) | `Account added` / `Account renamed` / `Accounts merged` / `Account deleted` / `Account updated` |
| Entries | EntryForm add & edit / SwipeRow delete / TripRename | `Entry saved` / `Entry deleted` / `Trip renamed` |

**Deliberate exclusions** (not defects — noted so the reviewer doesn't flag them):
- **Drag-reorder** (category/account order-on-drop) — a toast on every drag is noisy; excluded.
- **ImportBackup** and **WipeAllData** already show their own result toasts — left as-is.

---

## 3 · Budget amount grouped-on-blur

`BudgetField`'s input is `type="number"`, which can't render thousands separators. Switch to
`type="text" inputMode="numeric"` and display the amount grouped once the field blurs.

- `use-budget-input.ts` `commit()`: strip separators before parsing —
  `Number(raw.replace(/[^\d.-]/g, ''))` — so a grouped string still commits (and an unchanged
  grouped value is still detected as "no change").
- On blur (after commit), set the field's display to
  `new Intl.NumberFormat('en-US').format(amount)` (grouping only, no `฿`; the input already
  carries `.tnum` for tabular alignment). A blank field stays blank.
- `BudgetField`'s initial `prefill` renders grouped too (format the committed amount for the
  `defaultValue`).
- On focus, select-all so re-entry is one keystroke (grouped text stays; commit strips it).
- Update `use-budget-input.test.ts` for the strip-and-commit path (e.g. `'30,000'` commits
  `30000`; re-blurring the same grouped value is a no-op).

Keeps auto-save-on-blur; adds only the display format + separator-tolerant parse.

---

## 4 · Export + restore categories & accounts (JSON)

The entries CSV already round-trips category/account **names** (restore recreates them). What
it can't carry is **display metadata** (category emoji/hue/order/archived, account
icon/hue/order) and any **zero-entry** category/account. Add a supplementary JSON backup that
does — export **and** restore.

**Pure module** — `src/features/settings/catalog.ts`:

```ts
export type CatalogData = {
  version: 1;
  categories: { name: string; emoji: string; hue: number | null; sortOrder: number | null; archived: boolean }[];
  accounts: { name: string; icon: string; hue: number | null; sortOrder: number | null }[];
};
export function serializeCatalogJson(data: CatalogData): string;   // JSON.stringify, stable key order, 2-space
export function parseCatalogJson(text: string): CatalogData | null; // validate shape/version; null on any mismatch
```

**Reads** (typed selects, added to each feature's queries):
- `categories/queries.ts` → `getCategoryCatalog(db): Promise<CatalogData['categories']>`
- `accounts/queries.ts` → `getAccountCatalog(db): Promise<CatalogData['accounts']>`

**Restore** (upsert by name — UNIQUE — never delete; unlisted rows may be entry-referenced):
- `categories/queries.ts` → `restoreCategoryCatalog(db, rows)` — `insert … onConflictDoUpdate({ target: name, set: {emoji,hue,sortOrder,archived} })`, one `db.batch`.
- `accounts/queries.ts` → `restoreAccountCatalog(db, rows)` — same for `{icon,hue,sortOrder}`.
- Order-independent with the CSV: importing the JSON sets the look, the CSV adds entries —
  either order converges (upsert updates existing; entry-import auto-creates missing names).

**UI** (mirror the existing CSV `exportBackup` + `ImportBackup` precedent in `settings/page.tsx`):
- `exportCatalog()` inline in `settings/page.tsx`: `getCategoryCatalog` + `getAccountCatalog`
  → `serializeCatalogJson` → download `moniflow-catalog-<todayIso>.json` (same throwaway-`<a>`
  pattern as `exportBackup`).
- `src/features/settings/ui/ImportCatalog.tsx` — mirrors `ImportBackup` but: `.json` accept,
  `parseCatalogJson`, calls `restoreCategoryCatalog` + `restoreAccountCatalog` on the OPFS db,
  `bumpDataVersion()`, toasts `Categories & accounts restored`. **No destructive confirm
  dialog** (upsert-only — it never deletes), unlike the replace-all CSV restore.
- Both live in the Settings **Backup** section, beside the CSV controls.

---

## Out of scope
- No change to the Monefy CSV format or the entries restore.
- No deletion of unlisted categories/accounts on catalog restore (upsert-only).
- No toasts on drag-reorder.
- No new dependency (hand-rolled toast store + `Intl.NumberFormat` cover everything).
