# Whole-app font size — design

**Date:** 2026-07-14
**Status:** approved, ready for planning

## Goal

Let the user scale the entire app's typography from Settings, with no page reflow
("FOUC") on load. One personal, single-user local app — no cloud, OPFS-backed.

## Why it's small

Tailwind sizes text in `rem`, and `rem` always resolves against the root `<html>`
font-size. So the whole app scales from a **single lever** —
`document.documentElement.style.fontSize` — with **zero per-component changes**.
Fixed-px things (the 412px phone frame, 44px tap targets, radii) stay put, so text
grows inside a stable column.

The feature is a near-copy of the existing `icon_set` KV setting: no new table, no
migration.

## Decisions

- **Discrete presets, not a slider** — mirrors the icon-set segmented control; only
  sane sizes; one tap.
- **Percentage, not pixels.** `html.style.fontSize` is set as a *percent*
  (`112.5%`), which resolves against the browser's own default size. A user who
  raised their browser default for accessibility still scales correctly. Hardcoding
  `18px` would clobber that — an a11y regression, so we don't.
- **No FOUC (chosen over the lazier "accept the snap").** An inline `<head>` script
  applies the cached scale *before* first paint.
- **Two stores, two jobs.** OPFS = source of truth (what the Settings control
  reflects, consistent with every other setting). `localStorage` = a paint cache the
  inline script reads synchronously pre-paint. A mount-time reconciler keeps the
  cache honest with OPFS.

## Presets

| Label       | Scale  | key  | ~resolved (16px browser default) |
| ----------- | ------ | ---- | -------------------------------- |
| Small       | 87.5%  | `sm` | 14px                             |
| Default     | 100%   | `md` | 16px                             |
| Large       | 112.5% | `lg` | 18px                             |
| Extra Large | 125%   | `xl` | 20px                             |

## Components

### 1. Storage — `src/features/settings/queries.ts`

Mirror `getIconSet`/`setIconSet` exactly. Add:

- `FONT_SCALES = ['sm', 'md', 'lg', 'xl'] as const`, `type FontScale`,
  `DEFAULT_FONT_SCALE: FontScale = 'md'`
- `FONT_SCALE_PCT: Record<FontScale, string> = { sm: '87.5%', md: '100%', lg: '112.5%', xl: '125%' }`
  — the single source for the percentages, imported by the reconciler (and mirrored,
  by necessity, in the inline script — see note in §2).
- `isFontScale(value): value is FontScale`
- `getFontScale(db): Promise<FontScale>` — falls back to `DEFAULT_FONT_SCALE` for a
  fresh/old DB
- `setFontScale(db, value)` — same delete-then-insert `db.batch` as `setIconSet`,
  KV key `'font_scale'`

### 2. Apply before paint — inline script in `layout.tsx` `<head>`

Standard no-FOUC theme trick. A `<script dangerouslySetInnerHTML={{ __html: ... }}>`
in `<head>` that runs before the body paints:

```js
try {
  var m = { sm: '87.5%', md: '100%', lg: '112.5%', xl: '125%' };
  var s = m[localStorage.getItem('moniflow_font_scale')];
  if (s) document.documentElement.style.fontSize = s;
} catch (e) {}
```

- Missing/invalid key → do nothing → browser default = `md`. Zero flash.
- The percent map is duplicated here as a literal (an inline pre-hydration script
  can't import a module). The reconciler (§3) imports `FONT_SCALE_PCT`; if the
  presets ever change, both spots update. Acceptable, small, and localized — noted so
  it isn't a silent trap.
- `localStorage` key: `moniflow_font_scale`.
- **On `dangerouslySetInnerHTML` safety:** the injected string is a hardcoded
  compile-time constant — no interpolation, no user/DB/`args` value reaches it — so
  there is no XSS surface. This is the standard `next-themes` pre-hydration pattern.
  It reads `localStorage` (which the reconciler and action are the only writers of,
  and only ever with a validated `FontScale` key), not the DOM.

### 3. Keep the cache honest — `src/features/settings/use-font-scale.ts` (new)

A named side-effect hook (per the "stateful logic → named hook with test"
convention). On mount:

1. `getFontScale` from OPFS,
2. set `html.style.fontSize = FONT_SCALE_PCT[scale]`,
3. write `localStorage.setItem('moniflow_font_scale', scale)`.

Normally a no-op (matches the inline script). Repairs the rare desync (localStorage
cleared but OPFS kept, or vice versa). Called once in `AppShell`.

### 4. The control — `settings/page.tsx`, `actions.ts`, `use-settings.ts`

- **`use-settings.ts`:** `SettingsData` gains `fontScale: FontScale`; add one more
  `getFontScale` to the existing `Promise.all`.
- **`actions.ts`:** new `setFontScaleAction(formData)` — validate `isFontScale`
  (real guard, not just the `<select>`), `setFontScale(db)`, **also**
  `localStorage.setItem('moniflow_font_scale', value)`, then `bumpDataVersion()`.
- **`settings/page.tsx`:** a 4th `<section>` with a `<select>` mirroring the
  icon-set control. `FONT_SCALE_LABELS = { sm: 'Small', md: 'Default', lg: 'Large', xl: 'Extra Large' }`.
  `defaultValue={fontScale}`, `name="fontScale"`, `action={setFontScaleAction}`, a
  short helper `<p>` and the shared Save button.

## Data flow

```
Save in Settings
  └─ setFontScaleAction
       ├─ setFontScale(OPFS)          ← source of truth
       ├─ localStorage.setItem(...)   ← paint cache
       └─ bumpDataVersion()           ← settings page re-reads, <select> repaints

Page load
  └─ <head> inline script  → reads localStorage → sets html font-size (pre-paint, no FOUC)
  └─ AppShell mount → useFontScale → reads OPFS → re-applies + refreshes localStorage (reconcile)
```

## Testing

- `queries.test.ts`: `setFontScale`→`getFontScale` round-trip; `isFontScale` guard
  (rejects unknown / non-string); default fallback for an empty DB.
- `use-font-scale.test.ts` (`renderHook`): applies the OPFS value to
  `document.documentElement.style.fontSize` and writes `localStorage`.
- **Skipped:** no test for the inline `<head>` script itself — untestable one-liner;
  the reconciler exercises the same map/apply path.

## Out of scope

- No slider / free-form size.
- No per-surface font sizing — one global lever only.
- No change to any component's Tailwind classes — scaling is entirely via `rem`.
- `font_scale` is a device/browser preference; it is **not** part of the CSV backup
  (the CSV holds only ledger entries), matching `icon_set` and `cutoff_day`.
