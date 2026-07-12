# Toast + ConfirmDialog UI primitives — design

**Date:** 2026-07-12
**Concern:** 2 of 3. Sibling spec: `2026-07-12-accounts-design.md`. Deferred sibling: Google Drive backup/restore (future brainstorm) — will consume this spec's `ConfirmDialog` to gate its destructive **restore**.
**Status:** approved, ready for implementation plan.

## Problem

The app has no transient notification surface and no reusable confirm. Feedback today is implicit (Server Action + `revalidatePath` re-renders the list); destructive confirmation is either two-tap arm-in-place (`DeleteCategoryButton`) or a bespoke native `<dialog>` (`CategoryPickerDialog`). Two real needs have emerged: **Undo** on destructive account merges (spec #1), and a genuine irreversible yes/no (wipe data now; Drive restore later).

## Approach

Build **both** primitives by hand, **zero dependencies** — no Radix, no `sonner`. Both are native-shaped (a `<dialog>` and an `aria-live` portal) and share one visual language with the existing `<dialog>` sheets. This was a deliberate user call over a lib.

## `toast()` — transient notifications

- `src/shared/ui/ToastRegion.tsx` — a single `aria-live="polite"` (assertive for errors) portal, mounted once in `app/layout.tsx`.
- Module-level API (`src/shared/ui/toast.ts`): `toast(msg)` and `toast.action(msg, { label, onClick })`. Client-only; a small event emitter / store the region subscribes to (custom hook `use-toasts.ts` with a `renderHook` test).
- Auto-dismiss ~5s (pause on hover/focus), stackable, respects `prefers-reduced-motion` (no slide/fade when reduced).
- **Undo** is the primary caller: account merge (spec #1) fires `toast.action("Merged into Cash", { label: "Undo", onClick })`; Undo restores via a Server Action. The window to undo == the toast lifetime.

## `ConfirmDialog` — irreversible yes/no

- `src/shared/ui/ConfirmDialog.tsx` — native `<dialog>` reusing the `showModal()` / `::backdrop` / Esc / backdrop-click pattern already in `MoreSheet` (focus-trap for free).
- Props kept to what we actually call: `title`, `body`, `confirmLabel`, `onConfirm`, `destructive?` (styles the confirm button with `--color-loss`), and open/close control. **No** variant/icon/size config-explosion.
- Shares its dialog **chrome** with spec #1's account merge picker, but the merge picker keeps its own `<select>` — it is not routed through this yes/no API.

## First real caller: "Wipe all data" (settings)

A new destructive row on `src/app/settings/page.tsx`:

- Button → `ConfirmDialog` ("Delete all entries, categories, and accounts? This cannot be undone.") → on confirm, a Server Action clears the tables back to empty, then `toast("All data cleared")` and `revalidatePath('/', 'layout')`.
- Server action in `src/features/settings/actions.ts` (or a small `data` action module): delete-all across entries/categories/accounts within a transaction. Guard: this is genuinely irreversible (no soft-delete) — that's the point, and why it's confirm-gated.

> This gives `ConfirmDialog` a legitimate caller today rather than a speculative one. The **same** primitive later gates Drive **restore** (overwrite local with backup) in concern #3.

## Testing (TDD)

- `use-toasts` — add/auto-dismiss/manual-dismiss/undo callback fired, timers faked (`renderHook`).
- `ToastRegion` — renders queued toasts, `aria-live` present, action button invokes `onClick` (RTL).
- `ConfirmDialog` — confirm invokes `onConfirm`, cancel/Esc/backdrop closes without firing, destructive styling applied (RTL).
- wipe-all Server Action — clears all three tables, is transactional (unit test against a temp DB).

## Out of scope (YAGNI)

No Radix / `sonner` · no generic confirm config-explosion · no toast positions/queue-limits/promise-toasts · no soft-delete/trash for wipe (irreversible by design) · Drive restore's use of `ConfirmDialog` lives in concern #3, not here.
