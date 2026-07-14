# Whole-app Font Size — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user scale the entire app's typography from Settings via 4 discrete presets, with no font flash on page load.

**Architecture:** One lever — `document.documentElement.style.fontSize` set as a **percent** — scales the whole `rem`-based UI while the fixed-px phone frame and tap targets stay put. The preference is a KV row in the existing `settings` table (source of truth, read via OPFS). A pre-paint inline `<head>`-equivalent script reads a `localStorage` cache to apply the size before first paint (no FOUC). A mount-and-version-subscribed reconciler hook (`useFontScale`) is the single writer of both `html` font-size and the `localStorage` cache, so a Save applies live and the cache never drifts from OPFS.

**Tech Stack:** Next.js 16 App Router (static export), React 19, TypeScript 5.9 strict, Drizzle + sqlite-proxy (OPFS/WASM in browser, node proxy in tests), Vitest + @testing-library/react.

## Global Constraints

Copied verbatim from `docs/superpowers/specs/2026-07-14-app-font-size-design.md` and the project CLAUDE.md:

- TS strict: **no `any`, no `as`, no `!`, no `@ts-*` comments**; `type` over `interface`; `for..of` over `forEach`; `satisfies` + `as const` for typed config.
- `font.style.fontSize` is a **percent** (`'112.5%'`), never a px value — a percent scales against the user's browser default (accessibility). Never hardcode px.
- Presets: `sm`=`87.5%`, `md`=`100%` (default), `lg`=`112.5%`, `xl`=`125%`.
- `localStorage` key is exactly `moniflow_font_scale`.
- OPFS `settings` KV is the source of truth; `localStorage` is only a paint cache.
- `font_scale` is a device preference — **not** part of the CSV backup.
- No changes to any component's Tailwind classes — scaling is entirely via `rem`.
- **Supersedes the spec's data-flow §4:** the *action* writes only OPFS + `bumpDataVersion()`; the *reconciler hook* is the sole writer of `html` font-size and `localStorage`. This is DRYer (single display-cache writer) and makes the resize apply live on Save (the version bump re-runs the hook), not just on reload.
- Before committing: `npm run format:files <changed>`, then `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` — all must pass.

---

## File structure

- `src/features/settings/queries.ts` (modify) — add the `font_scale` KV read/write + preset constants. Owns the storage contract.
- `src/features/settings/queries.test.ts` (modify) — round-trip / guard / default tests.
- `src/features/settings/use-font-scale.ts` (create) — the reconciler hook: applies OPFS scale to `html` + `localStorage`, re-runs on data-version bump.
- `src/features/settings/use-font-scale.test.ts` (create) — hook test.
- `src/features/settings/use-settings.ts` (modify) — surface `fontScale` for the Settings control's `defaultValue`.
- `src/features/settings/use-settings.test.ts` (modify) — assert the new default.
- `src/features/settings/actions.ts` (modify) — add `setFontScaleAction`.
- `src/app/settings/page.tsx` (modify) — add the `<select>` section.
- `src/shared/ui/AppShell.tsx` (modify) — call `useFontScale()` once.
- `src/app/layout.tsx` (modify) — pre-paint inline script.

---

## Task 1: Storage — `font_scale` KV in queries.ts

**Files:**
- Modify: `src/features/settings/queries.ts` (append after the icon-set block, ~line 57)
- Test: `src/features/settings/queries.test.ts` (add describe blocks + extend the imports)

**Interfaces:**
- Consumes: `Db` from `@db/client`; `settings` table; `eq` from `drizzle-orm` (all already imported at the top of `queries.ts`).
- Produces:
  - `FONT_SCALES: readonly ['sm','md','lg','xl']`
  - `type FontScale = 'sm' | 'md' | 'lg' | 'xl'`
  - `DEFAULT_FONT_SCALE: FontScale` (= `'md'`)
  - `FONT_SCALE_PCT: Record<FontScale, string>` (= `{ sm:'87.5%', md:'100%', lg:'112.5%', xl:'125%' }`)
  - `FONT_SCALE_STORAGE_KEY: 'moniflow_font_scale'`
  - `isFontScale(value: unknown): value is FontScale`
  - `getFontScale(db: Db): Promise<FontScale>`
  - `setFontScale(db: Db, value: FontScale): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Add to the existing imports in `src/features/settings/queries.test.ts` (extend the `from './queries'` list):

```ts
import {
  // ...existing imports (getCutoff, setCutoff, ...) unchanged...
  getFontScale,
  setFontScale,
  isFontScale,
  FONT_SCALE_PCT,
} from './queries';
```

Append these describe blocks at the end of `queries.test.ts`:

```ts
describe('getFontScale / setFontScale', () => {
  it('defaults to md when nothing is stored', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    expect(await getFontScale(db)).toBe('md');
  });

  it('round-trips a stored scale and overwrites on re-write', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await setFontScale(db, 'lg');
    expect(await getFontScale(db)).toBe('lg');
    await setFontScale(db, 'sm');
    expect(await getFontScale(db)).toBe('sm');
  });

  it('falls back to md if the stored value is somehow unknown', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await db.run(sql`INSERT INTO settings (key, value) VALUES ('font_scale', 'huge')`);
    expect(await getFontScale(db)).toBe('md');
  });
});

describe('isFontScale', () => {
  it('accepts the four known scales and rejects everything else', () => {
    expect(isFontScale('sm')).toBe(true);
    expect(isFontScale('md')).toBe(true);
    expect(isFontScale('lg')).toBe(true);
    expect(isFontScale('xl')).toBe(true);
    expect(isFontScale('huge')).toBe(false);
    expect(isFontScale(undefined)).toBe(false);
    expect(isFontScale(2)).toBe(false);
  });
});

describe('FONT_SCALE_PCT', () => {
  it('maps every scale to a percent string', () => {
    expect(FONT_SCALE_PCT).toEqual({
      sm: '87.5%',
      md: '100%',
      lg: '112.5%',
      xl: '125%',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/features/settings/queries.test.ts`
Expected: FAIL — `getFontScale`, `setFontScale`, `isFontScale`, `FONT_SCALE_PCT` are not exported.

- [ ] **Step 3: Implement the storage functions**

Append to `src/features/settings/queries.ts` (after `setIconSet`, before the card-fee block is fine — anywhere at module scope):

```ts
// Whole-app font scale — one KV row driving the root html font-size. Stored as a short enum key;
// the percent it maps to (FONT_SCALE_PCT) is applied to document.documentElement so the entire
// rem-based UI scales at once. Mirrors the icon-set KV exactly — no new table, no migration.
const FONT_SCALE_KEY = 'font_scale';
export const FONT_SCALES = ['sm', 'md', 'lg', 'xl'] as const;
export type FontScale = (typeof FONT_SCALES)[number];
const DEFAULT_FONT_SCALE: FontScale = 'md';

// Percent (not px): resolves against the browser's own default font-size, so a user who raised
// their browser default for accessibility still scales correctly. Single source for the numbers —
// the reconciler hook imports this; the pre-paint inline script (layout.tsx) must inline the same
// literal because it can't import a module (documented there).
export const FONT_SCALE_PCT: Record<FontScale, string> = {
  sm: '87.5%',
  md: '100%',
  lg: '112.5%',
  xl: '125%',
};

// localStorage key for the pre-paint cache (see use-font-scale.ts and layout.tsx).
export const FONT_SCALE_STORAGE_KEY = 'moniflow_font_scale';

export function isFontScale(value: unknown): value is FontScale {
  return typeof value === 'string' && FONT_SCALES.some((s) => s === value);
}

// Falls back to md for a fresh DB or one that predates this setting.
export async function getFontScale(db: Db): Promise<FontScale> {
  const [row] = await db.select().from(settings).where(eq(settings.key, FONT_SCALE_KEY)).all();
  return row !== undefined && isFontScale(row.value) ? row.value : DEFAULT_FONT_SCALE;
}

export async function setFontScale(db: Db, value: FontScale): Promise<void> {
  await db.batch([
    db.delete(settings).where(eq(settings.key, FONT_SCALE_KEY)),
    db.insert(settings).values({ key: FONT_SCALE_KEY, value }),
  ]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/features/settings/queries.test.ts`
Expected: PASS (all blocks, including the three new describes).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/settings/queries.ts src/features/settings/queries.test.ts
npm run typecheck && npm run lint && npm test -- src/features/settings/queries.test.ts
git add src/features/settings/queries.ts src/features/settings/queries.test.ts
git commit -m "feat(settings): add font_scale KV storage + presets" -m "getFontScale/setFontScale mirror the icon-set KV row. FONT_SCALE_PCT maps each preset to a percent (not px) so it scales against the browser default. Adds isFontScale guard and the localStorage cache-key constant."
```

---

## Task 2: Reconciler hook — `useFontScale`

**Files:**
- Create: `src/features/settings/use-font-scale.ts`
- Create: `src/features/settings/use-font-scale.test.ts`

**Interfaces:**
- Consumes: `getFontScale`, `FONT_SCALE_PCT`, `FONT_SCALE_STORAGE_KEY` (Task 1); `getBrowserDb` from `@db/browser`; `useDataVersion` from `@shared/data-version`.
- Produces: `useFontScale(): void` — side-effect-only hook. On mount and on every data-version bump it reads `getFontScale` from OPFS, sets `document.documentElement.style.fontSize = FONT_SCALE_PCT[scale]`, and writes `localStorage[FONT_SCALE_STORAGE_KEY] = scale`. It is the **single writer** of both.

- [ ] **Step 1: Write the failing test**

Create `src/features/settings/use-font-scale.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureSettingsTable } from './schema';
import { setFontScale, FONT_SCALE_STORAGE_KEY } from './queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useFontScale } from './use-font-scale';

describe('useFontScale', () => {
  beforeEach(async () => {
    document.documentElement.style.fontSize = '';
    localStorage.clear();
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('applies the default (md -> 100%) from a fresh DB and caches it', async () => {
    renderHook(() => useFontScale());
    await waitFor(() => expect(document.documentElement.style.fontSize).toBe('100%'));
    expect(localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe('md');
  });

  it('re-applies and re-caches when the data-version bumps after a write', async () => {
    renderHook(() => useFontScale());
    await waitFor(() => expect(document.documentElement.style.fontSize).toBe('100%'));

    const db = await getBrowserDb();
    await setFontScale(db, 'lg');
    act(() => bumpDataVersion());

    await waitFor(() => expect(document.documentElement.style.fontSize).toBe('112.5%'));
    expect(localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe('lg');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/settings/use-font-scale.test.ts`
Expected: FAIL — `./use-font-scale` module / `useFontScale` export does not exist.

- [ ] **Step 3: Implement the hook**

Create `src/features/settings/use-font-scale.ts`:

```ts
'use client';

import { useEffect } from 'react';
import { getBrowserDb } from '@db/browser';
import { getFontScale, FONT_SCALE_PCT, FONT_SCALE_STORAGE_KEY } from './queries';
import { useDataVersion } from '@shared/data-version';

// Single writer of the app-wide font size. Reads the source-of-truth scale from OPFS, applies its
// percent to the root <html> (scaling the whole rem-based UI), and refreshes the localStorage cache
// the pre-paint inline script (layout.tsx) reads on the next load. Re-runs on every data-version
// bump, so saving a new scale in Settings resizes the app live — and reconciles the cache if it ever
// drifts from OPFS (e.g. localStorage cleared but OPFS kept). Called once, in AppShell.
export function useFontScale(): void {
  const version = useDataVersion();

  useEffect(() => {
    void (async () => {
      const db = await getBrowserDb();
      const scale = await getFontScale(db);
      document.documentElement.style.fontSize = FONT_SCALE_PCT[scale];
      localStorage.setItem(FONT_SCALE_STORAGE_KEY, scale);
    })();
  }, [version]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/settings/use-font-scale.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/settings/use-font-scale.ts src/features/settings/use-font-scale.test.ts
npm run typecheck && npm run lint && npm test -- src/features/settings/use-font-scale.test.ts
git add src/features/settings/use-font-scale.ts src/features/settings/use-font-scale.test.ts
git commit -m "feat(settings): add useFontScale reconciler hook" -m "Single writer of the root html font-size and the localStorage paint cache. Reads OPFS as source of truth and re-applies on each data-version bump, so a Settings save resizes the app live and the cache never drifts."
```

---

## Task 3: Surface `fontScale` in `useSettings`

**Files:**
- Modify: `src/features/settings/use-settings.ts`
- Modify: `src/features/settings/use-settings.test.ts`

**Interfaces:**
- Consumes: `getFontScale`, `type FontScale` (Task 1).
- Produces: `SettingsData` gains `fontScale: FontScale`; `useSettings` returns it (for the Settings `<select>` `defaultValue`).

- [ ] **Step 1: Update the failing test**

In `src/features/settings/use-settings.test.ts`, add `setFontScale` to the queries import:

```ts
import { setCutoff, setIconSet, setFontScale } from './queries';
```

In the first test ("loads the defaults"), add after the existing assertions:

```ts
    expect(data.fontScale).toBe('md');
```

In the second test ("refetches when the data-version bumps"), add a write before the `bumpDataVersion()` call and an assertion after the existing `waitFor`:

```ts
    await setFontScale(db, 'xl');
    // ...existing setCutoff/setIconSet + act(bumpDataVersion) stay...
```

```ts
    expect(result.current.data?.fontScale).toBe('xl');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/settings/use-settings.test.ts`
Expected: FAIL — `data.fontScale` is `undefined` (property not on `SettingsData`).

- [ ] **Step 3: Extend the hook**

In `src/features/settings/use-settings.ts`:

Update the import line:

```ts
import { getCutoff, getIconSet, getCardFeePct, getFontScale, type IconSet, type FontScale } from './queries';
```

Extend the type:

```ts
export type SettingsData = {
  cutoff: number;
  iconSet: IconSet;
  cardFeePct: number;
  fontScale: FontScale;
};
```

Extend the `Promise.all` and the `setData`:

```ts
      const [cutoff, iconSet, cardFeePct, fontScale] = await Promise.all([
        getCutoff(db),
        getIconSet(db),
        getCardFeePct(db),
        getFontScale(db),
      ]);
      setData({ cutoff, iconSet, cardFeePct, fontScale });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/settings/use-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/settings/use-settings.ts src/features/settings/use-settings.test.ts
npm run typecheck && npm run lint && npm test -- src/features/settings/use-settings.test.ts
git add src/features/settings/use-settings.ts src/features/settings/use-settings.test.ts
git commit -m "feat(settings): read fontScale in useSettings" -m "Surfaces the stored scale so the Settings control can show the current selection as its defaultValue."
```

---

## Task 4: `setFontScaleAction`

**Files:**
- Modify: `src/features/settings/actions.ts`

**Interfaces:**
- Consumes: `setFontScale`, `isFontScale` (Task 1); `getBrowserDb`, `bumpDataVersion` (already imported in `actions.ts`).
- Produces: `setFontScaleAction(formData: FormData): Promise<void>` — validates `formData.get('fontScale')` with `isFontScale`, writes OPFS, bumps the data-version. Does **not** touch `localStorage` (the reconciler hook owns that — see Global Constraints).

No unit test: `actions.ts` has no existing test file (client-side OPFS writes are exercised via the hooks and the app; matches `setIconSetAction` etc.). The validation logic lives in the tested `isFontScale`.

- [ ] **Step 1: Add the action**

In `src/features/settings/actions.ts`, extend the queries import:

```ts
import { setCutoff, isValidCutoffDay, setIconSet, isIconSet, setFontScale, isFontScale } from './queries';
```

Add the action (next to `setIconSetAction`):

```ts
// Backing the font-size picker. Validates the value is a known scale, writes OPFS (source of truth),
// then bumps the data-version — which re-runs useFontScale, resizing the app live and refreshing the
// localStorage paint cache. The action deliberately does NOT write localStorage or html: single
// writer = the reconciler hook.
export async function setFontScaleAction(formData: FormData): Promise<void> {
  const value = formData.get('fontScale');
  if (!isFontScale(value)) {
    throw new Error(`Unknown font scale: ${typeof value === 'string' ? value : 'a file'}`);
  }
  const db = await getBrowserDb();
  await setFontScale(db, value);
  bumpDataVersion();
}
```

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run typecheck && npm run lint`
Expected: PASS (no test to run for this task).

- [ ] **Step 3: Commit**

```bash
npm run format:files src/features/settings/actions.ts
npm run typecheck && npm run lint
git add src/features/settings/actions.ts
git commit -m "feat(settings): add setFontScaleAction" -m "Validates the scale, writes OPFS, and bumps the data-version. Leaves html + localStorage to the reconciler hook (single writer)."
```

---

## Task 5: Settings page `<select>` + wire `useFontScale` into AppShell

**Files:**
- Modify: `src/app/settings/page.tsx`
- Modify: `src/shared/ui/AppShell.tsx`

**Interfaces:**
- Consumes: `FONT_SCALES` (Task 1), `setFontScaleAction` (Task 4), `data.fontScale` from `useSettings` (Task 3), `useFontScale` (Task 2).
- Produces: a new Settings section (the control) and the app-wide application of the scale (AppShell mounts the reconciler).

- [ ] **Step 1: Wire the reconciler into AppShell**

In `src/shared/ui/AppShell.tsx`, add the import:

```ts
import { useFontScale } from '@features/settings/use-font-scale';
```

Call it at the top of the component body, above the existing `useSearchSuggestions()` line:

```ts
export function AppShell({ children }: { children: ReactNode }) {
  useFontScale();
  const { suggestions, iconSet } = useSearchSuggestions();
```

- [ ] **Step 2: Add the Settings control**

In `src/app/settings/page.tsx`:

Extend the queries import to include `FONT_SCALES`:

```ts
import { ICON_SETS, FONT_SCALES } from '@features/settings/queries';
```

Extend the actions import:

```ts
import {
  setCutoffAction,
  setIconSetAction,
  setCardFeePctAction,
  setFontScaleAction,
} from '@features/settings/actions';
```

Add a labels map next to `ICON_SET_LABELS`:

```ts
const FONT_SCALE_LABELS = {
  sm: 'Small',
  md: 'Default',
  lg: 'Large',
  xl: 'Extra Large',
} as const;
```

Destructure `fontScale`:

```ts
  const { cutoff, iconSet, cardFeePct, fontScale } = data;
```

Add this `<section>` immediately after the Category-icons `<section>` (i.e. before the Card FX fee section):

```tsx
      <section className="panel flex flex-col gap-4 p-5">
        <form action={setFontScaleAction} className="flex flex-col gap-3">
          <label htmlFor="fontScale" className="text-sm font-medium">
            Text size
          </label>
          <select
            id="fontScale"
            name="fontScale"
            defaultValue={fontScale}
            className="min-h-11 w-full max-w-xs rounded-[var(--radius-sm)] border px-3 py-2 text-base"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
          >
            {FONT_SCALES.map((scale) => (
              <option key={scale} value={scale}>
                {FONT_SCALE_LABELS[scale]}
              </option>
            ))}
          </select>
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            Scales text across the whole app. The phone frame and tap targets stay the same size — only
            the type grows or shrinks. Applies as soon as you save.
          </p>
          <button type="submit" className="btn btn-primary w-fit">
            Save
          </button>
        </form>
      </section>
```

- [ ] **Step 3: Verify typecheck, lint, and full test suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS across the suite (no behavior regressed).

- [ ] **Step 4: Commit**

```bash
npm run format:files src/app/settings/page.tsx src/shared/ui/AppShell.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/settings/page.tsx src/shared/ui/AppShell.tsx
git commit -m "feat(settings): text-size control + apply app-wide" -m "Adds the Text size <select> (Small/Default/Large/Extra Large) backed by setFontScaleAction, and mounts useFontScale in AppShell so the chosen scale applies across every page and updates live on save."
```

---

## Task 6: Pre-paint inline script (no FOUC) + end-to-end verification

**Files:**
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: nothing at runtime (the script is a self-contained literal); conceptually mirrors `FONT_SCALE_PCT` and `FONT_SCALE_STORAGE_KEY` from Task 1.
- Produces: the size is applied before the body paints, so there is no flash from default → preferred size on load.

- [ ] **Step 1: Add the inline script**

In `src/app/layout.tsx`, add the script as the **first child of `<body>`**, before `<AppShell>`:

```tsx
      <body className="min-h-dvh">
        {/* No-FOUC: apply the saved text scale before the app paints. Reads the localStorage cache
            (written by useFontScale) and sets the root font-size, so the rem-based UI never flashes
            from default → preferred size on load. Missing/invalid → browser default (md). This is a
            pre-hydration inline script (standard next-themes pattern), so it CANNOT import a module —
            the percent map and key are inlined here and mirror FONT_SCALE_PCT / FONT_SCALE_STORAGE_KEY
            in features/settings/queries.ts (keep the two in sync if the presets ever change).
            dangerouslySetInnerHTML is safe here: the string is a hardcoded compile-time constant with
            no interpolation — no user/DB value reaches it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var m={sm:'87.5%',md:'100%',lg:'112.5%',xl:'125%'};" +
              "var s=m[localStorage.getItem('moniflow_font_scale')];" +
              'if(s)document.documentElement.style.fontSize=s;}catch(e){}',
          }}
        />
        <AppShell>{children}</AppShell>
      </body>
```

- [ ] **Step 2: Verify build, typecheck, lint, tests**

Run: `npm run typecheck && npm run lint && npm run build:web && npm test`
Expected: PASS — including the production static-export build (`build:web`), which must succeed for a shippable app.

- [ ] **Step 3: End-to-end manual verification in a real browser**

Use the `/run` skill (or `npm run dev:web`, open `http://127.0.0.1:4010`). Verify:

1. Go to **Settings → Text size**, choose **Extra Large**, Save. The whole app's text grows **immediately** (no reload). The phone frame width and the bottom-bar tap targets do **not** change.
2. Set it to **Small**, Save — text shrinks live.
3. Set it to **Large**, Save, then **reload** the page. On reload the app paints **directly** at Large — no visible flash from default → Large (the no-FOUC script). Confirm via DevTools that `<html>` has `style="font-size: 112.5%"` from first paint.
4. In DevTools, `localStorage.getItem('moniflow_font_scale')` returns `'lg'`. Delete that key, reload: the app briefly loads at default then the reconciler snaps it back to Large and re-writes the key (the drift-repair path) — confirming OPFS is the source of truth.

- [ ] **Step 4: Commit**

```bash
npm run format:files src/app/layout.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/layout.tsx
git commit -m "feat(app): apply saved text size before paint (no FOUC)" -m "Pre-hydration inline script reads the localStorage cache and sets the root font-size before the body paints, so a non-default text size never flashes on load. Completes the whole-app font-size feature."
```

---

## Self-review

**Spec coverage:**
- Storage (spec §1) → Task 1. ✅
- Pre-paint inline script (spec §2) → Task 6. ✅
- Reconciler hook (spec §3) → Task 2, mounted in Task 5. ✅
- Control: `useSettings` fontScale (spec §4) → Task 3; action → Task 4; Settings `<select>` → Task 5. ✅
- Percent-not-px, presets, localStorage key, OPFS-as-truth, not-in-CSV, no class changes → Global Constraints + enforced in code. ✅
- Tests: queries round-trip/guard/default (Task 1), hook applies + caches (Task 2), useSettings default (Task 3); inline script left untested by design (Task 6 note + manual verify). ✅

**Deviation from spec, intentional:** spec §4 had the action writing `localStorage`; the plan makes the reconciler the single writer (Global Constraints note). DRYer + live resize on save. No coverage lost.

**Placeholder scan:** none — every code step shows complete content.

**Type consistency:** `FontScale`, `FONT_SCALE_PCT`, `FONT_SCALE_STORAGE_KEY`, `isFontScale`, `getFontScale`, `setFontScale`, `setFontScaleAction`, `useFontScale`, `SettingsData.fontScale`, `FONT_SCALE_LABELS`, form field name `fontScale` — consistent across Tasks 1–6.
