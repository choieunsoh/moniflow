# Theme Axes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give moniflow a light/dark preference and a nine-palette accent picker, as two independent axes, without changing what a user who never opens Settings sees.

**Architecture:** Every colour is declared once as `light-dark(<light>, <dark>)`; the light/dark axis flips `color-scheme` on `<html>` via `data-theme` and every token resolves itself. The accent axis stamps `data-accent`, whose blocks redeclare exactly three raw tokens (`--action`, `--on-action`, `--action-hover`); `--color-selected` and `--color-focus-ring` derive from `--action`, so a palette is three lines. Both defaults (`system`, `ink`) stamp **no attribute** — the default is what `:root` already declares and therefore cannot drift from it. Preference is stored in the existing `settings` KV table with a localStorage copy read by a pre-paint inline script, mirroring `useFontScale`.

**Tech Stack:** Next 16 App Router (`output: 'export'`), React 19, Tailwind CSS v4 (`@theme`), CSS `light-dark()` + `color-mix()`, drizzle-orm over sqlite-proxy, Vitest + Testing Library (jsdom).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-04-theme-axes-design.md`. Branch: `feat/theme-axes` (already created; do not branch again).
- **Dark values never change.** Every dark half in this plan is the value shipped in v1.14.0, copied verbatim. A diff that alters a dark hex is a bug.
- **`--color-gain`, `--color-loss`, `--color-warn` never change with the accent.** They get a light half; no `[data-accent]` block may declare them.
- **`SLICE_COLORS` and `OTHER_COLOR` in `src/features/entries/donut.ts` are not touched.** (The spec calls these `DONUT_COLORS`; the real export is `SLICE_COLORS`. Use the real name.) Neither are `categoryColor`, `categoryColorBold`, `discForeground` in `src/features/categories/color.ts`.
- **`src/app/globals.test.ts` already exists** and already holds `token`, `luminance`, `contrast` and `hue`, plus assertions that read a bare hex out of `globals.css`. All colour testing in this plan EXTENDS that file. Do not create a second contrast test file — duplicating the colour maths is the defect this note exists to prevent.
- TypeScript rules are enforced as ESLint **errors**: no `any`, no `as` casts, no `!` assertions, no `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`, `type` over `interface`, `for..of` over `.forEach`. `as const` is allowed.
- Money/date formatting rules do not apply to this work, but the font rule does: do not introduce any font, and do not touch `--font-sans`.
- Browser floor: `light-dark()` needs Chrome 123 / Safari 17.5, `color-mix()` needs Chrome 111 / Safari 16.2. The target device is a Galaxy S24 Ultra; this is acceptable and is not gated behind a fallback.
- Before each commit run, in this order, and all must pass:
  ```bash
  npm run format:files <files you changed>
  npm run typecheck
  npm run lint
  npm run format:check
  npm test
  ```
- Commit format `type(scope): description` with a body explaining why. Scopes here: `app` (globals.css, layout, settings page), `features` (settings feature), `shared`. **Single scope word only.** Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```
  Never add a `Claude-Session:` trailer.
- Run `git commit` with repeated `-m` flags. Never `git commit -F <file>` and never a heredoc — the wrapped `git` on this machine receives no stdin and the commit-msg hook rejects the result as empty.

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `src/features/settings/theme.ts` | Pure values and guards for both axes. No DOM, no storage, no db — so it is unit-testable and the inline script can mirror it. |
| `src/features/settings/theme.test.ts` | Guards, plus pinning the two storage-key strings the inline script duplicates. |
| `src/features/settings/use-theme.ts` | The single writer of `<html>`'s two attributes and of the localStorage cache. Mirrors `use-font-scale.ts`. |
| `src/features/settings/use-theme.test.ts` | `renderHook` coverage of default, stored value, and re-application on a data-version bump. |
| `src/features/settings/ui/ThemePicker.tsx` | The light/dark radiogroup. |
| `src/features/settings/ui/ThemePicker.test.tsx` | Render + click coverage. |
| `src/features/settings/ui/AccentPicker.tsx` | The 3×3 accent radiogroup. |
| `src/features/settings/ui/AccentPicker.test.tsx` | Render + click coverage. |
_(No new test file. All colour assertions extend `src/app/globals.test.ts`, which already exists.)_

**Modified:**

| Path | Change |
| --- | --- |
| `src/app/globals.css` | `@theme` gains the `--color-action*` indirection; all colour tokens become `light-dark()` pairs; nine `[data-accent]` blocks are appended after `:root`; the comment banning an accent is rewritten; `.btn-primary:hover` moves to `--color-action-hover`. |
| `src/app/globals.test.ts` | `token()` becomes theme-aware so it can read a `light-dark()` pair; every existing assertion runs over both themes; the accent walk, the `ink == :root` pin, the no-status-shift rule and the selected-state check are added; the stale "the accent is gone" block is rewritten. |
| `src/features/settings/queries.ts` | Adds the `theme` and `accent` KV rows beside the existing `font_scale` block. |
| `src/features/settings/actions.ts` | Adds `setThemeAction` / `setAccentAction`, taking typed values rather than `FormData`. |
| `src/shared/ui/AppShell.tsx` | Calls `useTheme()` beside `useFontScale()`. |
| `src/app/layout.tsx` | Pre-paint script stamps both attributes; `themeColor` becomes a `prefers-color-scheme` pair. |
| `src/app/settings/page.tsx` | A new "Appearance" panel above "Category icons". |

---

## Task 1: Pure theme values and guards

**Files:**

- Create: `src/features/settings/theme.ts`
- Test: `src/features/settings/theme.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `THEMES: readonly ['system', 'light', 'dark']`, `type Theme = (typeof THEMES)[number]`
  - `ACCENTS: readonly ['ink','indigo','violet','plum','rose','clay','olive','teal','azure']`, `type Accent = (typeof ACCENTS)[number]`
  - `DEFAULT_THEME: Theme` (`'system'`), `DEFAULT_ACCENT: Accent` (`'ink'`)
  - `isTheme(value: unknown): value is Theme`, `isAccent(value: unknown): value is Accent`
  - `readTheme(raw: string | null): Theme`, `readAccent(raw: string | null): Accent`
  - `THEME_STORAGE_KEY = 'moniflow_theme'`, `ACCENT_STORAGE_KEY = 'moniflow_accent'`
  - `ACCENT_LABELS: Record<Accent, string>`

- [ ] **Step 1: Write the failing test**

Create `src/features/settings/theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ACCENTS,
  ACCENT_LABELS,
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  isAccent,
  isTheme,
  readAccent,
  readTheme,
  THEMES,
  THEME_STORAGE_KEY,
} from './theme';

describe('theme values', () => {
  it('offers exactly the three theme states, defaulting to system', () => {
    expect(THEMES).toEqual(['system', 'light', 'dark']);
    expect(DEFAULT_THEME).toBe('system');
  });

  it('offers nine accents with ink first, because ink is the default and stamps no attribute', () => {
    expect(ACCENTS).toHaveLength(9);
    expect(ACCENTS[0]).toBe('ink');
    expect(DEFAULT_ACCENT).toBe('ink');
  });

  it('names every accent, so two palettes 8 degrees apart are not told apart by a dot alone', () => {
    for (const accent of ACCENTS) expect(ACCENT_LABELS[accent].length).toBeGreaterThan(0);
  });

  it('accepts only known values', () => {
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('DARK')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isAccent('teal')).toBe(true);
    expect(isAccent('purple')).toBe(false);
    expect(isAccent(7)).toBe(false);
  });

  it('reads anything unreadable as the default: absent, corrupt, or another app’s key', () => {
    expect(readTheme(null)).toBe('system');
    expect(readTheme('')).toBe('system');
    expect(readTheme('midnight')).toBe('system');
    expect(readTheme('light')).toBe('light');
    expect(readAccent(null)).toBe('ink');
    expect(readAccent('fuchsia')).toBe('ink');
    expect(readAccent('azure')).toBe('azure');
  });

  // The pre-paint script in layout.tsx cannot import a module, so it inlines these two strings.
  // If either changes here without changing there, the app flashes the wrong theme on every load.
  it('pins the storage keys the pre-paint inline script duplicates', () => {
    expect(THEME_STORAGE_KEY).toBe('moniflow_theme');
    expect(ACCENT_STORAGE_KEY).toBe('moniflow_accent');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/settings/theme.test.ts`
Expected: FAIL — `Failed to resolve import "./theme"`.

- [ ] **Step 3: Write the implementation**

Create `src/features/settings/theme.ts`:

```ts
/**
 * Appearance preference, as pure values.
 *
 * Deliberately free of DOM, storage and db access: this module is unit-testable, and the pre-paint
 * inline script in layout.tsx mirrors its logic without importing it (it has to run before any
 * bundle loads). The duplicated constants are the two storage keys; theme.test.ts pins them on this
 * side, and the inline script's copies are called out in a comment there.
 *
 * The two axes never interact. `data-theme` decides which half of every `light-dark()` pair
 * resolves; `data-accent` decides which set of pairs is in play. Each accent declares both halves,
 * so any accent works in either theme and switching one leaves the other alone.
 */

export const THEME_STORAGE_KEY = 'moniflow_theme';
export const ACCENT_STORAGE_KEY = 'moniflow_accent';

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = 'system';

/**
 * 'ink' is the ORIGINAL palette and is deliberately not stamped onto <html> — it is what the bare
 * `:root` block already declares. Selecting it removes the attribute, exactly as theme 'system'
 * does, so the default costs no CSS and cannot drift from the base tokens.
 *
 * The hues are spread around the wheel at a fixed OKLCH lightness per theme (86% dark, 30% light),
 * which is what lets them sit as little as 3 degrees from a donut slice without being confusable:
 * the donut band is at L 62-66, so the separation is lightness, not hue. See the spec.
 */
export const ACCENTS = [
  'ink',
  'indigo',
  'violet',
  'plum',
  'rose',
  'clay',
  'olive',
  'teal',
  'azure',
] as const;
export type Accent = (typeof ACCENTS)[number];
export const DEFAULT_ACCENT: Accent = 'ink';

// Named, not just shown: plum and rose sit 40 degrees apart and violet and plum 30, which a 28px
// dot alone turns into a memory test rather than a choice.
export const ACCENT_LABELS: Record<Accent, string> = {
  ink: 'Ink',
  indigo: 'Indigo',
  violet: 'Violet',
  plum: 'Plum',
  rose: 'Rose',
  clay: 'Clay',
  olive: 'Olive',
  teal: 'Teal',
  azure: 'Azure',
};

export function isTheme(value: unknown): value is Theme {
  // Comparing element by element rather than `THEMES.includes(value)`: `.includes` on a readonly
  // tuple narrows its argument to the tuple's own union, which `value: unknown` is not assignable
  // to — and working around that would need a cast, which this repo bans.
  for (const theme of THEMES) if (theme === value) return true;
  return false;
}

export function isAccent(value: unknown): value is Accent {
  for (const accent of ACCENTS) if (accent === value) return true;
  return false;
}

/** Anything unreadable — absent key, corrupted value, another app's key — means the default. */
export function readTheme(raw: string | null): Theme {
  return isTheme(raw) ? raw : DEFAULT_THEME;
}

export function readAccent(raw: string | null): Accent {
  return isAccent(raw) ? raw : DEFAULT_ACCENT;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/settings/theme.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Gates and commit**

```bash
npm run format:files src/features/settings/theme.ts src/features/settings/theme.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/features/settings/theme.ts src/features/settings/theme.test.ts
git commit -m "feat(features): add the pure value module for both theme axes" -m "Guards and defaults for the light/dark and accent axes, with no DOM, storage or db access, so the pre-paint inline script in layout.tsx can mirror the logic it cannot import and the whole thing stays unit-testable." -m "Anything unreadable decodes to the default rather than throwing: an absent key, a corrupted value, and another app's key on a shared origin are the same case, and none of them should stop the app painting." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Make the existing colour test theme-aware

`src/app/globals.test.ts` already exists and already reads token values out of `globals.css`. Its
`token()` helper is **hex-only** — `--${name}:\s*(#[0-9a-fA-F]{6})` — so the moment Task 3 writes
`--color-text: light-dark(#101420, #e7ebf4)` the regex finds no hex after the colon and every
assertion in the file throws.

Teach it about pairs FIRST, with the palette untouched, and prove it still green. Today every token
is a bare hex, so both themes read the same value and the suite simply doubles. That way a failure in
Task 3 means the new light half is wrong, not that the checker is.

**Files:**

- Modify: `src/app/globals.test.ts:16-20` (the `token` helper) and the four `describe` blocks

**Interfaces:**

- Consumes: nothing new.
- Produces: `token(name: string, theme: Theme): string` where `type Theme = 'light' | 'dark'`, and
  `THEMES: readonly Theme[]`. Tasks 3 and 4 call `token` with both arguments.

- [ ] **Step 1: Read the file you are about to change**

Run: `cat src/app/globals.test.ts`

It is 131 lines. Note four things before editing: `token()` throws when it finds no hex; `contrast()`,
`luminance()` and `hue()` are already written and must be REUSED, not reimplemented; the assertions
use `it.each` with tuple rows; and `SLICE_COLORS` is imported from `@features/entries/donut`.

- [ ] **Step 2: Replace the `token` helper**

Replace lines 16–20 (the whole `token` function) with:

```ts
// A theme, as this file means it: which half of a light-dark() pair to read. Not the user-facing
// preference (which has a third state, 'system') — that one lives in features/settings/theme.ts and
// resolves to one of these two before any colour is chosen.
type Theme = 'light' | 'dark';
const THEMES: readonly Theme[] = ['light', 'dark'];

// Every colour in globals.css is declared once as `light-dark(<light>, <dark>)`, so a token has two
// values and every assertion below runs twice. A token declared as a bare hex is the same in both
// themes, which is exactly what the browser does with it, so it is returned for either.
//
// `scope` is the CSS text to search: the whole file for the base palette, or a single
// `[data-accent]` block for a palette. Searching the whole file for an accent-owned token would
// return whichever declaration appears first rather than the one that wins.
function token(name: string, theme: Theme, scope: string = css): string {
  const pair = new RegExp(
    `--${name}:\\s*light-dark\\(\\s*(#[0-9a-fA-F]{6})\\s*,\\s*(#[0-9a-fA-F]{6})\\s*\\)`,
  ).exec(scope);
  if (pair !== null) return theme === 'light' ? pair[1] : pair[2];

  const single = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(scope);
  if (single !== null) return single[1];

  throw new Error(`token --${name} not found in globals.css as a hex or a light-dark() hex pair`);
}
```

- [ ] **Step 3: Run every existing assertion over both themes**

Rewrite the four existing `describe` blocks so each row is checked per theme. Keep every pair, floor
and comment that is already there — this step changes only how many times each runs.

```ts
describe.each(THEMES)('%s theme', (theme) => {
  describe('text contrast', () => {
    it.each([
      ['color-text', 'color-bg', 4.5],
      ['color-text', 'color-surface', 4.5],
      ['color-muted', 'color-bg', 4.5],
      ['color-muted', 'color-surface', 4.5],
      ['color-faint', 'color-surface-2', 4.5],
      ['color-on-action', 'color-action', 4.5],
    ])('%s on %s clears AA', (ink, ground, floor) => {
      expect(contrast(token(ink, theme), token(ground, theme))).toBeGreaterThanOrEqual(floor);
    });
  });

  describe('non-text contrast', () => {
    // WCAG 2.2 SC 1.4.11: a UI boundary or indicator that carries meaning needs 3:1.
    it.each([
      ['color-focus-ring', 'color-surface'],
      ['color-focus-ring', 'color-bg'],
      ['color-border-strong', 'color-surface'],
      ['color-action', 'color-bg'],
    ])('%s clears 3:1 on %s', (mark, ground) => {
      expect(contrast(token(mark, theme), token(ground, theme))).toBeGreaterThanOrEqual(3);
    });

    // The decorative edge is deliberately quieter than 3:1: a panel is already delimited by its own
    // surface lightness, and a blanket 3:1 outlines every card. It must still be visible, which the
    // measured 1.29:1 of the previous palette was not.
    it('the decorative border is visible without outlining every card', () => {
      const ratio = contrast(token('color-border', theme), token('color-surface', theme));
      expect(ratio).toBeGreaterThanOrEqual(2);
      expect(ratio).toBeLessThan(3);
    });
  });

  describe('hue separation', () => {
    const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

    it.each(['color-gain', 'color-loss'])('no category colour impersonates --%s', (name) => {
      const reserved = hue(token(name, theme));
      for (const slice of SLICE_COLORS) {
        expect(apart(hue(slice), reserved)).toBeGreaterThan(25);
      }
    });
  });
});
```

Leave the two remaining `describe` blocks (`'the accent is gone'` and `'no component references a
removed token'`) exactly as they are for now — they scan CSS text rather than reading token values,
so they do not care about themes. Task 4 revisits the first of them.

- [ ] **Step 4: Run it against the untouched palette**

Run: `npm test -- src/app/globals.test.ts`
Expected: PASS. The assertion count roughly doubles (each themed row now runs twice) while
`globals.css` is unchanged, so both themes read the same hex. **If anything fails here the helper is
wrong** — fix it now, because from Task 3 on a failure will look like a palette problem.

- [ ] **Step 5: Prove the new branch of `token` is actually reachable**

The `light-dark()` branch cannot have run yet — no token uses it. Verify it works before trusting it:
temporarily change one line in `globals.css` to
`--color-text: light-dark(#101420, #e7ebf4);`, run
`npm test -- src/app/globals.test.ts`, and confirm it still passes (the dark half is the shipped
value, and the light half is the one Task 3 will use). Then **revert that one line** with
`git checkout src/app/globals.css` before committing.

Report what you saw. A helper whose new branch was never executed is not a tested helper.

- [ ] **Step 6: Gates and commit**

```bash
npm run format:files src/app/globals.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/app/globals.test.ts
git commit -m "test(app): read token contrast per theme" -m "The colour assertions read a bare hex straight out of globals.css, so the next commit — which declares every colour as a light-dark() pair — would make the helper find no hex after the colon and throw on every one of them." -m "Teaches the helper about pairs while the palette is still untouched, so it lands green on the shipped values. From here a failure means a new colour is wrong rather than that the checker is, which is the whole reason this is its own commit." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
---

## Task 3: Migrate every token to `light-dark()`

**Files:**

- Modify: `src/app/globals.css:11-80` (the `@theme` and `:root` blocks) and `:175-178` (`.btn-primary:hover`)
- Modify: `src/app/globals.test.ts` (add the action-hover and semantic rows to the themed blocks)

**Interfaces:**

- Consumes: the theme-aware `token(name, theme, scope?)` and `THEMES` from Task 2.
- Produces: CSS custom properties `--action`, `--on-action`, `--action-hover` in `:root`, plus the Tailwind-facing `--color-action`, `--color-on-action`, `--color-action-hover` in `@theme`. Task 4's accent blocks override the three raw names; Task 8's `AccentPicker` reads `var(--action)`.

- [ ] **Step 1: Add the missing rows to the themed assertions, and watch them fail**

In `src/app/globals.test.ts`, inside the `describe.each(THEMES)` block, add to the `'text contrast'`
rows:

```ts
      ['color-on-action', 'color-action-hover', 4.5],
      ['color-gain', 'color-surface', 4.5],
      ['color-loss', 'color-surface', 4.5],
      ['color-warn', 'color-surface', 4.5],
      ['color-gain', 'color-bg', 4.5],
      ['color-loss', 'color-bg', 4.5],
      ['color-warn', 'color-bg', 4.5],
```

The gain/loss/warn rows are new coverage regardless of the theme work: those three have never been
contrast-checked, and this task is what gives them a light half that could be wrong.

- [ ] **Step 2: Run to verify the new rows fail**

Run: `npm test -- src/app/globals.test.ts`
Expected: FAIL — the `color-action-hover` rows throw
`token --color-action-hover not found in globals.css as a hex or a light-dark() hex pair`. The
gain/loss/warn rows PASS already (those tokens exist today and clear AA on the dark ground); they are
here to catch a bad light half in Step 3.

- [ ] **Step 3: Rewrite the `@theme` colour block**

In `src/app/globals.css`, replace the comment and colour declarations at the top of `@theme`
(currently lines 3–47, from the `/* ── Design tokens ─` banner through `--color-warn`) with:

```css
/* ── Design tokens ───────────────────────────────────────────────────────────
   Dark-first, calm, trustworthy. Every color is a token. The ground is a cool
   blue-black, the colour of ink on a bank statement, rather than a default
   neutral grey.

   Every colour is declared ONCE, as light-dark(<light>, <dark>). The function
   resolves against the element's used `color-scheme`, so the three theme states
   are driven entirely by that one property:
     no attribute       -> color-scheme: light dark -> follows the OS, live, no JS
     [data-theme=dark]  -> color-scheme: dark       -> forced dark on a light OS
     [data-theme=light] -> color-scheme: light      -> forced light on a dark OS
   This replaces the usual three-block pattern (a :root, a prefers-color-scheme
   block, and an attribute block) in which the dark values appear twice verbatim
   and can silently drift apart. No colour may have its ONLY definition inside a
   media query or an attribute selector.

   Every ratio in the comments below is checked by src/app/globals.test.ts,
   which parses THIS FILE, in BOTH themes. Read it before changing any value. */
@theme {
  /* Type — ONE family app-wide: IBM Plex Sans carries UI, prose and figures alike. There is
     deliberately no mono: a mono face draws a slashed or dotted zero, which this project bans for
     figures. Numbers align through .tnum (font-variant-numeric: tabular-nums), not a second family.
     Do not add one. next/font (layout.tsx) defines the --font-plex-sans var this consumes. */
  --font-sans: var(--font-plex-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  /* Surfaces (canvas → raised). Cool blue-black, the colour of ink on a bank statement: the ground
     is derived from the subject rather than defaulted to a neutral grey. The light half inverts the
     ramp — surface becomes the lightest of the three, not the darkest. */
  --color-backdrop: light-dark(#e4e7f0, #06080c); /* behind the phone frame on wide viewports */
  --color-bg: light-dark(#f7f8fc, #0c0f16);
  --color-surface: light-dark(#ffffff, #141926);
  --color-surface-2: light-dark(#eff1f8, #1d2333);
  /* Two steps by role. The decorative edge is deliberately under 3:1 because a panel is already
     delimited by its surface lightness and a blanket 3:1 outlines every card; the strong edge is for
     boundaries that mean "tap here" (inputs, keys, dividers, chrome) and clears 3:1. */
  --color-border: light-dark(#aeb5ca, #4a5470); /* 2.05:1 / 2.33:1 on surface, no floor */
  --color-border-strong: light-dark(#868ea7, #5b6684); /* 3.26:1 / 3.07:1 on surface */

  /* Ink */
  --color-text: light-dark(#101420, #e7ebf4); /* 17.31:1 / 16.05:1 on bg */
  --color-muted: light-dark(#535b73, #98a1ba); /* 6.75:1 / 6.80:1 on surface */
  --color-faint: light-dark(#646c84, #868fa8); /* 4.63:1 / 4.86:1 on surface-2 */

  /* The one next action per screen: the MAXIMUM-CONTRAST object on the page — the lightest thing in
     dark, the darkest in light. That property is about LIGHTNESS, not about having no hue, which is
     what lets the accent axis tint it without weakening it. These three are the only tokens a
     [data-accent] block redeclares, and they indirect through the raw --action / --on-action /
     --action-hover in :root so a picker swatch can stamp its own palette and paint itself with it.
     Hue still belongs to CATEGORY IDENTITY: an accent sits at OKLCH L 86 (dark) or L 30 (light)
     while the category band sits at L 62-66, so the two never compete even at the same hue. Do not
     saturate these into a mid-lightness fill — that is the version that competes. */
  --color-action: var(--action);
  --color-on-action: var(--on-action);
  --color-action-hover: var(--action-hover);
  /* Ink on a saturated fill: a category disc, an account icon, a destructive button. Named for its
     job rather than for the accent it used to sit on, because it never had anything to do with it.
     Theme-independent: the disc is its own ground for the glyph drawn on it. */
  --color-on-fill: #ffffff;

  /* Semantics — value + status. These NEVER move with the accent, unlike pordee's: red means over
     budget and errors, green means a refund, and a colour that changes with a picker means neither.
     The dark halves are unusable on a light ground (#19c37d on white is ~2.0:1), so each gets a
     darkened light half rather than being shared across themes. */
  --color-gain: light-dark(#0d7a4d, #19c37d); /* 5.37:1 / 7.64:1 on surface */
  --color-loss: light-dark(#c2323f, #f0616d); /* 5.49:1 / 5.54:1 on surface */
  --color-warn: light-dark(#8a5200, #f5a524); /* 6.39:1 / 8.60:1 on surface */

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
}
```

- [ ] **Step 4: Rewrite the `:root` block**

Replace the `:root` block that follows (currently lines 54–80, from the `/* Non-Tailwind design vars`
comment through the closing brace) with:

```css
/* Non-Tailwind design vars: the raw accent tokens, selection tint, elevation, motion, z-scale. */
:root {
  /* Three states, one property. The default stamps NO attribute, so `light dark` lets every
     light-dark() token follow the OS directly — an OS switch while the app is open is picked up
     with no JS at all. */
  color-scheme: light dark;

  /* The accent axis, default palette. These are the bare :root values, so choosing 'ink' in the
     picker REMOVES data-accent rather than stamping it, and the default cannot drift from the base.
     [data-accent='ink'] below repeats them verbatim, for the picker's own swatch; globals.test.ts
     pins the two equal. */
  --action: light-dark(#161b2b, #f2f5fc);
  --on-action: light-dark(#f7f8fc, #0c0f16);
  --action-hover: light-dark(#0c0f16, #e7ebf4);

  /* "Where you are": a lift of the ground itself. Derived from --action rather than declared per
     palette, so an accent block stays three lines and a new palette cannot forget it.

     The two alphas are NOT the same number, and the difference is measured rather than aesthetic: a
     deep tint on a light ground lifts less than a pale tint on a dark one, so a matched 10/12 split
     gave 1.20:1 in light against 1.32:1 in dark. 14/12 evens them at roughly 1.30-1.43:1 across all
     nine palettes and both grounds.

     THAT RATIO IS A FLOOR FOR "MEASURABLE", NOT FOR "ENOUGH ON ITS OWN". A selected state must also
     carry a border or a tick: this app shipped a selected tile at 1.02:1 that no one could see,
     precisely because it leaned on this lift alone. globals.test.ts holds the floor; the components
     hold the border. */
  --color-selected: light-dark(
    color-mix(in srgb, var(--action) 14%, transparent),
    color-mix(in srgb, var(--action) 12%, transparent)
  );
  /* WCAG 2.2 SC 1.4.11 wants 3:1 for a focus indicator. The action colour clears it in both themes
     for every palette by construction — it is the maximum-contrast object on the page — so this is
     one line rather than a per-palette declaration. The existing 2px offset keeps it legible even
     on the action button itself. */
  --color-focus-ring: var(--action);

  /* Black in both themes: a scrim under a light sheet is still black, and a shadow is an absence of
     light rather than a colour. */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-2: 0 8px 28px -12px rgba(0, 0, 0, 0.7);

  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 150ms;
  --dur: 220ms;

  --z-header: 100;
  --z-dropdown: 200;
  --z-toast: 300;

  /* Mobile-only app frame. On the phone the column is edge-to-edge (screen <= this); on desktop it's
     a centered fixed-width phone frame. Target: Samsung Galaxy S24 Ultra (~384–412px CSS width). */
  --app-max-width: 412px;
}

/* The toggle works by flipping color-scheme, and nothing else. */
:root[data-theme='dark'] {
  color-scheme: dark;
}

:root[data-theme='light'] {
  color-scheme: light;
}
```

- [ ] **Step 5: Fix `.btn-primary:hover`**

Replace the `.btn-primary:hover` rule and its comment (currently around line 175):

```css
.btn-primary:hover {
  /* Was `var(--color-text)`, justified by the action being the lightest thing on the page so hover
     had to dim rather than brighten. That reasoning does not survive a hued action: each palette
     ships its own hover, one step further from the ground in whichever direction that theme's
     ground lies. */
  background: var(--color-action-hover);
}
```

- [ ] **Step 6: Run the colour test**

Run: `npm test -- src/app/globals.test.ts`
Expected: PASS. Every previously passing assertion still passes, now measured per theme against the
correct half, and the seven rows added in Step 1 pass too.

If a light-half row fails, the value is wrong — report the measured ratio rather than lowering the
floor. The floors in this file were chosen deliberately and the dark halves meet them today.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS, and the total should be at or above the 1068 baseline. `globals.test.ts` is the only
file that reads colour values out of `globals.css` — a failure anywhere else means something reads a
token through `getComputedStyle`, which this branch has not accounted for. Report it rather than
patching around it.

- [ ] **Step 8: Gates and commit**

```bash
npm run format:files src/app/globals.css src/app/globals.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/app/globals.css src/app/globals.test.ts
git commit -m "feat(app): declare every colour as a light-dark pair" -m "Adds the light half of the palette so the app can carry a light/dark preference. Every dark value is unchanged from v1.14.0, so nothing a current user sees moves; the light halves are new and every ratio in the comments was computed, not estimated." -m "Uses light-dark() against color-scheme rather than the usual three blocks (a :root, a prefers-color-scheme copy, and an attribute copy) in which the dark values appear twice and drift apart unnoticed. The default state stamps no attribute at all, so an OS theme switch while the app is open is followed with no JS." -m "- gain/loss/warn needed light halves, not sharing: #19c37d on white is ~2.0:1, illegible rather than dim. They also had no contrast coverage at all until now\n- --color-action now indirects through a raw --action so a picker swatch can stamp a palette and paint itself with it\n- --color-selected and --color-focus-ring derive from --action, so a palette is three lines and cannot forget them\n- the selected lift uses 14% in light against 12% in dark: a deep tint on a light ground lifts less than a pale tint on a dark one, and a matched pair measured 1.20:1 against 1.32:1\n- .btn-primary:hover moved off --color-text, whose justification was that the action has no hue" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: The nine accent palettes

**Files:**

- Modify: `src/app/globals.css` (append the accent blocks immediately after the `:root[data-theme='light']` rule)
- Modify: `src/app/globals.test.ts` (walk every accent block; pin `ink` equal to `:root`; forbid a status shift; check the selected lift; rewrite the stale "the accent is gone" block)

**Interfaces:**

- Consumes: `--action`/`--on-action`/`--action-hover` and the theme-aware `token(name, theme, scope?)` from Task 3; `ACCENTS` from Task 1.
- Produces: `[data-accent='<name>']` blocks for all nine names in `ACCENTS`.

- [ ] **Step 1: Replace the stale "the accent is gone" block**

That block exists to enforce that one treatment carries one meaning. It still should — but its name
and comment become false the moment a `data-accent` axis exists, and a comment that is confidently
wrong is worse than no comment. Replace the whole `describe('the accent is gone', ...)` block with:

```ts
describe('the accent axis stays in its lane', () => {
  // The six-meanings problem this palette was built to fix came from ONE colour meaning action,
  // location, selection, links, operators and every Save button at once. The user-chosen accent is
  // allowed to tint the action and the selection — they were already the same colour at different
  // intensities — but the tokens below are what carried the other four meanings, and their return
  // is how the problem comes back.
  it.each([
    'color-accent',
    'color-accent-hover',
    'color-accent-text',
    'color-accent-soft',
    'color-accent-ring',
  ])('--%s stays gone', (name) => {
    expect(css).not.toContain(`--${name}:`);
  });
});
```

- [ ] **Step 2: Add the accent walk**

Append to `src/app/globals.test.ts`:

```ts
// Each palette's declarations, isolated. Searching the whole file for an accent-owned token would
// return :root's copy rather than the block's, so every accent assertion scopes to its own block.
function accentBlock(name: string): string {
  const match = new RegExp(`\\[data-accent='${name}'\\]\\s*\\{([^}]*)\\}`).exec(css);
  if (match === null) throw new Error(`no [data-accent='${name}'] block in globals.css`);
  return match[1];
}

const ACCENT_NAMES = [
  'ink',
  'indigo',
  'violet',
  'plum',
  'rose',
  'clay',
  'olive',
  'teal',
  'azure',
] as const;

describe.each(ACCENT_NAMES)('accent %s', (accent) => {
  const block = accentBlock(accent);

  describe.each(THEMES)('%s theme', (theme) => {
    // Only the accent-owned pairs. Everything else is theme-owned and already checked above;
    // re-checking it per palette would assert nine times that :root did not change.
    it('ink on the action fill clears AA', () => {
      expect(
        contrast(token('on-action', theme, block), token('action', theme, block)),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it('ink on the hover fill clears AA', () => {
      expect(
        contrast(token('on-action', theme, block), token('action-hover', theme, block)),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it('the action reads as an object against the ground', () => {
      expect(contrast(token('action', theme, block), token('color-bg', theme))).toBeGreaterThanOrEqual(3);
    });

    // The selected state is --action composited over the surface at the alpha :root declares. This
    // is the check whose absence let a 1.02:1 selected tile ship: the hex-only token() could not
    // read an rgba() value, so the lift was never measured at all.
    //
    // 1.25:1 is a floor for MEASURABLE, not for sufficient. A selected state must also carry a
    // border or a tick — see the note on --color-selected in globals.css.
    it('the selected lift is measurable against both surfaces', () => {
      const alpha = theme === 'light' ? 0.14 : 0.12;
      for (const ground of ['color-surface', 'color-surface-2']) {
        const base = token(ground, theme);
        const lifted = composite(token('action', theme, block), base, alpha);
        expect(contrast(lifted, base)).toBeGreaterThanOrEqual(1.25);
      }
    });
  });
});

// Simple alpha-over-opaque compositing, which is what the browser does with a color-mix() against
// `transparent` painted on an opaque ground.
function composite(fg: string, bg: string, alpha: number): string {
  const mixed = channels(fg).map((c, i) => Math.round(alpha * c + (1 - alpha) * channels(bg)[i]));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

describe('accent palette structure', () => {
  // 'ink' duplicates :root so the picker can show it while another palette is live. Two copies of a
  // value are two values that drift, so they are pinned equal rather than trusted.
  it('pins [data-accent=ink] equal to the bare :root it duplicates', () => {
    const ink = accentBlock('ink');
    for (const name of ['action', 'on-action', 'action-hover']) {
      for (const theme of THEMES) {
        expect(token(name, theme, ink), `ink's --${name} (${theme})`).toBe(token(name, theme));
      }
    }
  });

  // A red that changes when the user picks a colour is a red that means nothing, and giving red a
  // meaning is what the previous palette slice spent its effort on.
  it.each(ACCENT_NAMES)('%s does not move a status colour', (accent) => {
    const block = accentBlock(accent);
    for (const name of ['--color-gain', '--color-loss', '--color-warn']) {
      expect(block, `${accent} must not declare ${name}`).not.toContain(`${name}:`);
    }
  });

  // Every name the picker offers must have a block, or that swatch silently paints the current
  // accent instead of the one it advertises.
  it('has a block for every accent the picker offers', () => {
    for (const name of ACCENT_NAMES) expect(() => accentBlock(name)).not.toThrow();
  });
});
```

Note `channels` is already defined near the top of this file — reuse it, do not write a second copy.

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- src/app/globals.test.ts`
Expected: FAIL — `no [data-accent='ink'] block in globals.css`.

- [ ] **Step 4: Append the accent blocks**

In `src/app/globals.css`, immediately after the `:root[data-theme='light']` rule:

```css
/* ── Accent palettes ─────────────────────────────────────────────────────────
   The SECOND theme axis, independent of light/dark.

   These carry the same specificity as the bare `:root` above (0,1,0 either way), so they win on
   SOURCE ORDER alone. Keep this block below `:root` or every palette silently stops applying.

   Deliberately NOT scoped to `:root`. Custom properties inherit, so an ordinary element carrying
   `data-accent` gets that palette for its own subtree — which is exactly how AccentPicker draws its
   swatches: each one is a plain element stamped with the palette it offers, painting itself with
   `var(--action)`. Scoping these to `:root` would force the picker to hardcode a second copy of
   every hex, and a second copy is a copy that drifts.

   Each block declares exactly THREE tokens. `--color-selected` and `--color-focus-ring` derive from
   `--action` in `:root`, so a new palette is three lines and cannot forget them.

   Every hex is a fixed-lightness OKLCH tint of one hue, which is the whole reason these can exist
   at all in an app whose hue budget belongs to category identity:
       dark   fill oklch(86% 0.075 H)   hover oklch(78% 0.085 H)   ink = --color-bg
       light  fill oklch(30% 0.09  H)   hover oklch(22% 0.09  H)   ink = light --color-bg
   The category band sits at L 62-66, so an accent 3 degrees off a slice is still unmistakable — the
   separation is lightness, not hue. Do not "fix" a palette by saturating it toward that band.

   No palette moves --color-gain, --color-loss or --color-warn. pordee shifts its status colours per
   accent; ours carry more meaning than pordee's do, and globals.test.ts fails a block that tries.
   -------------------------------------------------------------------------- */

/* The default, repeated verbatim from :root so a swatch can show it while another palette is live.
   Held equal to the base by globals.test.ts — change one of these and the other has to follow. */
[data-accent='ink'] {
  --action: light-dark(#161b2b, #f2f5fc);
  --on-action: light-dark(#f7f8fc, #0c0f16);
  --action-hover: light-dark(#0c0f16, #e7ebf4);
}

[data-accent='indigo'] {
  --action: light-dark(#1f285a, #bfcfff);
  --on-action: light-dark(#f7f8fc, #0c0f16);
  --action-hover: light-dark(#0e1343, #a4b5ef);
}

[data-accent='violet'] {
  --action: light-dark(#352053, #d8c6fc);
  --on-action: light-dark(#f7f8fc, #0c0f16);
  --action-hover: light-dark(#220b3d, #bfabe6);
}

[data-accent='plum'] {
  --action: light-dark(#461943, #eec0e9);
  --on-action: light-dark(#f7f8fc, #0c0f16);
  --action-hover: light-dark(#30042e, #d7a4d1);
}

[data-accent='rose'] {
  --action: light-dark(#511523, #febdc6);
  --on-action: light-dark(#f7f8fc, #0c0f16);
  --action-hover: light-dark(#390011, #e8a1ab);
}

[data-accent='clay'] {
  --action: light-dark(#501a00, #fcc2a9);
  --on-action: light-dark(#f7f8fc, #0c0f16);
  --action-hover: light-dark(#390400, #e6a68a);
}

[data-accent='olive'] {
  --action: light-dark(#293300, #cad9a2);
  --on-action: light-dark(#f7f8fc, #0c0f16);
  --action-hover: light-dark(#161f00, #b0c082);
}

[data-accent='teal'] {
  --action: light-dark(#003a3c, #95e1e0);
  --on-action: light-dark(#f7f8fc, #0c0f16);
  --action-hover: light-dark(#002527, #71c9c8);
}

[data-accent='azure'] {
  --action: light-dark(#003354, #a1dafc);
  --on-action: light-dark(#f7f8fc, #0c0f16);
  --action-hover: light-dark(#001e3d, #80c1e6);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- src/app/globals.test.ts`
Expected: PASS. Then run `npm test` for the whole suite.

- [ ] **Step 6: Prove the accent assertions can fail**

A test that cannot fail is worse than no test. Temporarily change `[data-accent='teal']`'s dark
`--on-action` from `#0c0f16` to `#95e1e0` (ink the same colour as its own fill) and run
`npm test -- src/app/globals.test.ts`. Confirm the teal AA assertion fails with a ratio near 1.0.
Then temporarily add `--color-loss: light-dark(#c2323f, #f0616d);` to that same block and confirm the
status-shift assertion fails naming teal.

Revert both with `git checkout src/app/globals.css`, re-run, confirm green, and report both failure
messages you saw.

- [ ] **Step 7: Gates and commit**

```bash
npm run format:files src/app/globals.css src/app/globals.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/app/globals.css src/app/globals.test.ts
git commit -m "feat(app): add nine accent palettes as fixed-lightness tints" -m "Gives the second theme axis its values. Each palette declares three tokens and nothing else, because --color-selected and --color-focus-ring derive from --action, so adding a tenth palette later is three lines that cannot forget a token." -m "The palettes are OKLCH tints at a fixed lightness per theme (86% dark, 30% light) rather than saturated fills. That is what makes them legal in an app that reserves hue for category identity: the category band sits at L 62-66, so an accent 3 degrees off a slice is still unmistakable because the separation is lightness. It also lands every ink pair between 11.8:1 and 13.4:1 instead of hovering near the 4.5 floor." -m "- no palette moves gain, loss or warn; a test fails a block that tries, because a red that changes with a picker is a red that means nothing\n- the selected lift is now measured per palette per theme, which is the check whose absence let a 1.02:1 selected tile ship in the previous palette slice\n- the stale 'the accent is gone' block is rewritten rather than deleted: the tokens it names must still stay gone, but its comment described an app that no longer exists" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Persist the two preferences

**Files:**

- Modify: `src/features/settings/queries.ts` (append after the `keypad_layout` block)
- Modify: `src/features/settings/actions.ts`
- Test: `src/features/settings/queries.test.ts` (append a describe block)

**Interfaces:**

- Consumes: `Theme`, `Accent`, `isTheme`, `isAccent`, `DEFAULT_THEME`, `DEFAULT_ACCENT` from `./theme` (Task 1); `settings` table and `Db` as the existing blocks do.
- Produces:
  - `getTheme(db: Db): Promise<Theme>`, `setTheme(db: Db, value: Theme): Promise<void>`
  - `getAccent(db: Db): Promise<Accent>`, `setAccent(db: Db, value: Accent): Promise<void>`
  - `setThemeAction(value: Theme): Promise<void>`, `setAccentAction(value: Accent): Promise<void>`

- [ ] **Step 1: Write the failing test**

Append to `src/features/settings/queries.test.ts`:

```ts
describe('theme and accent settings', () => {
  it('falls back to the defaults on a db that predates the setting', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    expect(await getTheme(db)).toBe('system');
    expect(await getAccent(db)).toBe('ink');
  });

  it('round-trips a stored choice on each axis independently', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await setTheme(db, 'light');
    await setAccent(db, 'teal');
    expect(await getTheme(db)).toBe('light');
    expect(await getAccent(db)).toBe('teal');

    await setTheme(db, 'dark');
    expect(await getTheme(db)).toBe('dark');
    expect(await getAccent(db)).toBe('teal');
  });

  it('replaces rather than accumulating rows, so a re-pick cannot leave two values', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await setAccent(db, 'rose');
    await setAccent(db, 'azure');
    expect(await getAccent(db)).toBe('azure');
  });

  it('reads a corrupted stored value as the default rather than propagating it into CSS', async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    await db.insert(settings).values({ key: 'accent', value: 'chartreuse' }).run();
    expect(await getAccent(db)).toBe('ink');
  });
});
```

Add whatever is missing to that file's existing imports: `getTheme`, `setTheme`, `getAccent`, `setAccent` from `./queries`, and `settings` from `./schema`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/features/settings/queries.test.ts`
Expected: FAIL — `getTheme is not a function` (or an import resolution error).

- [ ] **Step 3: Implement the queries**

Append to `src/features/settings/queries.ts`:

```ts
// Appearance — two KV rows driving the two theme axes. Same shape as the font-scale block above:
// short enum keys, no new table, no migration. The DB is the source of truth; use-theme.ts keeps a
// localStorage copy for the pre-paint script, and is the only writer of it.
//
// Both ride in the backup with no catalog change, because catalog.ts carries the settings table as
// a generic SettingRow[] blob rather than a named list of keys.
const THEME_KEY = 'theme';
const ACCENT_KEY = 'accent';

/** Falls back to 'system' for a fresh DB, one that predates this setting, or a corrupted value. */
export async function getTheme(db: Db): Promise<Theme> {
  const [row] = await db.select().from(settings).where(eq(settings.key, THEME_KEY)).all();
  return row !== undefined && isTheme(row.value) ? row.value : DEFAULT_THEME;
}

export async function setTheme(db: Db, value: Theme): Promise<void> {
  await db.batch([
    db.delete(settings).where(eq(settings.key, THEME_KEY)),
    db.insert(settings).values({ key: THEME_KEY, value }),
  ]);
}

/** Falls back to 'ink' — the palette the bare :root declares — on the same three cases. */
export async function getAccent(db: Db): Promise<Accent> {
  const [row] = await db.select().from(settings).where(eq(settings.key, ACCENT_KEY)).all();
  return row !== undefined && isAccent(row.value) ? row.value : DEFAULT_ACCENT;
}

export async function setAccent(db: Db, value: Accent): Promise<void> {
  await db.batch([
    db.delete(settings).where(eq(settings.key, ACCENT_KEY)),
    db.insert(settings).values({ key: ACCENT_KEY, value }),
  ]);
}
```

Add to the imports at the top of `queries.ts`:

```ts
import {
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  isAccent,
  isTheme,
  type Accent,
  type Theme,
} from './theme';
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/features/settings/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the actions**

Append to `src/features/settings/actions.ts`:

```ts
// Backing the two appearance pickers. These take a typed value rather than FormData, unlike the
// other settings actions: a picker applies on click and has no form to submit. The pickers stamp
// <html> themselves for the current frame; this persists the choice and bumps the data version,
// which re-runs useTheme to reconcile the localStorage paint cache for the NEXT load.
//
// Like setFontScaleAction, these deliberately do not write localStorage or touch <html>: the single
// writer of both is the reconciler hook.
export async function setThemeAction(value: Theme): Promise<void> {
  if (!isTheme(value)) throw new Error(`Unknown theme: ${String(value)}`);
  const db = await getBrowserDb();
  await setTheme(db, value);
  bumpDataVersion();
}

export async function setAccentAction(value: Accent): Promise<void> {
  if (!isAccent(value)) throw new Error(`Unknown accent: ${String(value)}`);
  const db = await getBrowserDb();
  await setAccent(db, value);
  bumpDataVersion();
}
```

Add to that file's imports: `setTheme`, `setAccent` from `./queries`, and `isTheme`, `isAccent`, `type Theme`, `type Accent` from `./theme`.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Gates and commit**

```bash
npm run format:files src/features/settings/queries.ts src/features/settings/queries.test.ts src/features/settings/actions.ts
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/features/settings/queries.ts src/features/settings/queries.test.ts src/features/settings/actions.ts
git commit -m "feat(features): persist the theme and accent choices" -m "Two KV rows beside the existing font-scale block — no new table and no migration, and they ride in the backup with no catalog change because catalog.ts carries the settings table as a generic blob rather than a named key list. Restoring on a new device brings the appearance with it." -m "The actions take a typed value rather than FormData, unlike every other settings action: these pickers apply on click and have no form to submit. A corrupted stored value reads as the default rather than propagating into a CSS attribute selector." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The reconciler hook

**Files:**

- Create: `src/features/settings/use-theme.ts`
- Test: `src/features/settings/use-theme.test.ts`
- Modify: `src/shared/ui/AppShell.tsx:23-24`

**Interfaces:**

- Consumes: `getTheme`, `getAccent` (Task 5); `THEME_STORAGE_KEY`, `ACCENT_STORAGE_KEY` (Task 1); `withDb` from `@shared/db-effect`; `useDataVersion` from `@shared/data-version`.
- Produces: `useTheme(): void`.

- [ ] **Step 1: Write the failing test**

Create `src/features/settings/use-theme.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureSettingsTable } from './schema';
import { setTheme, setAccent } from './queries';
import { THEME_STORAGE_KEY, ACCENT_STORAGE_KEY } from './theme';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useTheme } from './use-theme';

describe('useTheme', () => {
  beforeEach(async () => {
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.accent;
    localStorage.clear();
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('leaves both attributes off for the defaults, so :root stays the source of truth', async () => {
    renderHook(() => useTheme());
    await waitFor(() => expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system'));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.dataset.accent).toBeUndefined();
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('ink');
  });

  it('stamps an explicit choice on each axis', async () => {
    const db = await getBrowserDb();
    await setTheme(db, 'light');
    await setAccent(db, 'teal');

    renderHook(() => useTheme());

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(document.documentElement.dataset.accent).toBe('teal');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('teal');
  });

  it('re-applies on a data-version bump, and REMOVES an attribute when the default is chosen', async () => {
    const db = await getBrowserDb();
    await setAccent(db, 'rose');
    renderHook(() => useTheme());
    await waitFor(() => expect(document.documentElement.dataset.accent).toBe('rose'));

    await setAccent(db, 'ink');
    act(() => bumpDataVersion());

    await waitFor(() => expect(document.documentElement.dataset.accent).toBeUndefined());
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('ink');
  });

  it('reconciles a paint cache that has drifted from the db', async () => {
    localStorage.setItem(ACCENT_STORAGE_KEY, 'azure');
    renderHook(() => useTheme());
    await waitFor(() => expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('ink'));
    expect(document.documentElement.dataset.accent).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/features/settings/use-theme.test.ts`
Expected: FAIL — `Failed to resolve import "./use-theme"`.

- [ ] **Step 3: Implement the hook**

Create `src/features/settings/use-theme.ts`:

```ts
'use client';

import { useEffect } from 'react';
import { withDb } from '@shared/db-effect';
import { getAccent, getTheme } from './queries';
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  type Accent,
  type Theme,
} from './theme';
import { useDataVersion } from '@shared/data-version';

// Single writer of the app-wide appearance. Reads both axes from OPFS, stamps <html>, and refreshes
// the localStorage cache the pre-paint inline script (layout.tsx) reads on the next load. Re-runs on
// every data-version bump, so picking a theme in Settings persists live — and reconciles the cache
// if it ever drifts from OPFS (localStorage cleared but OPFS kept, or the reverse). Called once, in
// AppShell, beside useFontScale.
//
// A default choice REMOVES its attribute rather than stamping one. That is the whole reason the
// default cannot drift: 'system' leaves `color-scheme: light dark` in charge, so an OS switch is
// followed live with no JS, and 'ink' leaves the bare :root palette in play.
export function useTheme(): void {
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      const [theme, accent] = await Promise.all([getTheme(db), getAccent(db)]);
      applyTheme(theme);
      applyAccent(accent);
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      localStorage.setItem(ACCENT_STORAGE_KEY, accent);
    });
  }, [version]);
}

// Exported so the pickers can stamp optimistically on click without waiting for a write to OPFS and
// a data-version bump to come back around. The hook remains the only writer of the CACHE.
export function applyTheme(theme: Theme): void {
  if (theme === DEFAULT_THEME) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function applyAccent(accent: Accent): void {
  if (accent === DEFAULT_ACCENT) delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = accent;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/features/settings/use-theme.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire it into AppShell**

In `src/shared/ui/AppShell.tsx`, add the import beside the existing font-scale one:

```tsx
import { useTheme } from '@features/settings/use-theme';
```

and call it directly below `useFontScale()`:

```tsx
  useFontScale();
  // Appearance, same shape and for the same reason: the preference lives in OPFS, which only exists
  // client-side, so the shell is where it gets applied.
  useTheme();
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Gates and commit**

```bash
npm run format:files src/features/settings/use-theme.ts src/features/settings/use-theme.test.ts src/shared/ui/AppShell.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/features/settings/use-theme.ts src/features/settings/use-theme.test.ts src/shared/ui/AppShell.tsx
git commit -m "feat(features): apply the stored appearance from a single reconciler hook" -m "Mirrors useFontScale: OPFS is the source of truth, <html> is stamped from it on mount and on every data-version bump, and the localStorage copy exists only so the pre-paint script can avoid a flash on the next load. One writer of that cache means a cleared localStorage or a restored backup reconciles itself on the next open rather than fighting." -m "A default choice REMOVES its attribute instead of stamping one. That is what keeps the default honest: 'system' leaves color-scheme in charge so an OS switch is followed live with no JS, and 'ink' leaves the bare :root palette in play so it cannot drift from the base tokens." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Paint before first paint

**Files:**

- Modify: `src/app/layout.tsx:27-29` (viewport) and `:44-57` (the inline script)

**Interfaces:**

- Consumes: the storage-key strings pinned by `theme.test.ts` (Task 1). Imports nothing — a pre-hydration inline script cannot.
- Produces: nothing importable.

- [ ] **Step 1: Replace the viewport export**

In `src/app/layout.tsx`, replace the `themeColor` line and its comment:

```tsx
// themeColor lives on viewport, not metadata (Next 16). One entry per theme, each matching that
// theme's --color-bg, so the standalone chrome (status bar / task switcher) blends into the phone
// frame instead of sitting in the opposite theme. The dark value also corrects a stale one: it read
// #101114 while --color-bg has been #0c0f16 since the ledger-ink palette landed.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fc' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0f16' },
  ],
};
```

- [ ] **Step 2: Extend the pre-paint script**

Replace the `<script dangerouslySetInnerHTML=...>` element and its comment with:

```tsx
        {/* No-FOUC: apply the saved appearance before the app paints. Reads the localStorage cache
            (written by useFontScale and useTheme) and sets the root font-size and the two theme
            attributes, so the app never flashes default → preferred. Most visible on the installed
            PWA, where the splash hands straight over to a painted page.

            A missing or invalid value stamps NOTHING, which is the correct default in all three
            cases: no font-size override, `color-scheme: light dark` left to follow the OS, and the
            bare :root accent palette.

            This is a pre-hydration inline script, so it CANNOT import a module — the percent map,
            the accent list and both storage keys are inlined here and mirror FONT_SCALE_PCT /
            FONT_SCALE_STORAGE_KEY in features/settings/queries.ts and ACCENTS / THEME_STORAGE_KEY /
            ACCENT_STORAGE_KEY in features/settings/theme.ts. theme.test.ts pins the keys on that
            side; keep the lists in sync if the presets ever change.

            The accent is validated against a literal list rather than trusted, because it is
            interpolated into an attribute that CSS then selects on — a junk key would otherwise
            stamp junk onto <html>. dangerouslySetInnerHTML is safe here: the string is a hardcoded
            compile-time constant with no interpolation, so no user or DB value reaches it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var d=document.documentElement;' +
              "var m={sm:'87.5%',md:'100%',lg:'112.5%',xl:'125%'};" +
              "var s=m[localStorage.getItem('moniflow_font_scale')];" +
              'if(s)d.style.fontSize=s;' +
              "var t=localStorage.getItem('moniflow_theme');" +
              "if(t==='light'||t==='dark')d.dataset.theme=t;" +
              "var a=localStorage.getItem('moniflow_accent');" +
              "if(a&&a!=='ink'&&['indigo','violet','plum','rose','clay','olive','teal','azure'].indexOf(a)>-1)" +
              'd.dataset.accent=a;' +
              '}catch(e){}',
          }}
        />
```

- [ ] **Step 3: Verify the build still exports**

Run: `npm run build:web`
Expected: build succeeds and writes `out/`. This is the gate that catches a malformed inline script — a syntax error there does not fail typecheck or lint.

- [ ] **Step 4: Gates and commit**

```bash
npm run format:files src/app/layout.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/app/layout.tsx
git commit -m "feat(app): stamp the saved appearance before first paint" -m "Extends the existing no-FOUC inline script to the two theme attributes, so the app never flashes the wrong theme — most visible on the installed PWA, where the splash hands straight over to a painted page. A missing or invalid value stamps nothing, which is the right default on all three axes." -m "The accent is validated against an inlined literal list rather than trusted, because it is interpolated into an attribute that CSS then selects on. Also corrects a stale themeColor: it read #101114 while --color-bg has been #0c0f16 since the ledger-ink palette landed, and it now carries one entry per theme." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: The two pickers

**Files:**

- Create: `src/features/settings/ui/ThemePicker.tsx`, `src/features/settings/ui/ThemePicker.test.tsx`
- Create: `src/features/settings/ui/AccentPicker.tsx`, `src/features/settings/ui/AccentPicker.test.tsx`

**Interfaces:**

- Consumes: `THEMES`, `ACCENTS`, `ACCENT_LABELS`, `readTheme`, `readAccent`, `THEME_STORAGE_KEY`, `ACCENT_STORAGE_KEY`, types (Task 1); `applyTheme`, `applyAccent` (Task 6); `setThemeAction`, `setAccentAction` (Task 5).
- Produces: `ThemePicker`, `AccentPicker` — both take no props.

- [ ] **Step 1: Write the failing tests**

Create `src/features/settings/ui/ThemePicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { THEME_STORAGE_KEY } from '../theme';

vi.mock('../actions', () => ({ setThemeAction: vi.fn().mockResolvedValue(undefined) }));

import { setThemeAction } from '../actions';
import { ThemePicker } from './ThemePicker';

describe('ThemePicker', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
    localStorage.clear();
    vi.mocked(setThemeAction).mockClear();
  });

  it('offers the three states and starts on the stored one', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(<ThemePicker />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(await screen.findByRole('radio', { name: /dark/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('stamps <html> on click without waiting for the write to come back', async () => {
    render(<ThemePicker />);
    await userEvent.click(screen.getByRole('radio', { name: /light/i }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(setThemeAction).toHaveBeenCalledWith('light');
  });

  it('removes the attribute for "system", leaving color-scheme to follow the OS', async () => {
    render(<ThemePicker />);
    await userEvent.click(screen.getByRole('radio', { name: /dark/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');

    await userEvent.click(screen.getByRole('radio', { name: /system/i }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
```

Create `src/features/settings/ui/AccentPicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACCENTS, ACCENT_STORAGE_KEY } from '../theme';

vi.mock('../actions', () => ({ setAccentAction: vi.fn().mockResolvedValue(undefined) }));

import { setAccentAction } from '../actions';
import { AccentPicker } from './AccentPicker';

describe('AccentPicker', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.accent;
    localStorage.clear();
    vi.mocked(setAccentAction).mockClear();
  });

  it('offers every palette, ink first', () => {
    render(<AccentPicker />);
    expect(screen.getAllByRole('radio')).toHaveLength(ACCENTS.length);
    expect(screen.getByRole('radio', { name: /ink/i })).toBeInTheDocument();
  });

  it('stamps each swatch with its OWN palette, so a swatch previews what it offers', () => {
    render(<AccentPicker />);
    // The bug this guards against: with the swatch unstamped, every dot inherits :root and paints
    // the CURRENTLY selected accent instead of the one it is offering.
    expect(screen.getByRole('radio', { name: /teal/i })).toHaveAttribute('data-accent', 'teal');
    expect(screen.getByRole('radio', { name: /ink/i })).toHaveAttribute('data-accent', 'ink');
  });

  it('starts on the stored palette and marks it beyond colour alone', async () => {
    localStorage.setItem(ACCENT_STORAGE_KEY, 'plum');
    render(<AccentPicker />);
    const plum = await screen.findByRole('radio', { name: /plum/i });
    expect(plum).toHaveAttribute('aria-checked', 'true');
  });

  it('stamps <html> on click, and removes the attribute for ink', async () => {
    render(<AccentPicker />);
    await userEvent.click(screen.getByRole('radio', { name: /azure/i }));
    expect(document.documentElement.dataset.accent).toBe('azure');
    expect(setAccentAction).toHaveBeenCalledWith('azure');

    await userEvent.click(screen.getByRole('radio', { name: /ink/i }));
    expect(document.documentElement.dataset.accent).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/features/settings/ui/ThemePicker.test.tsx src/features/settings/ui/AccentPicker.test.tsx`
Expected: FAIL — both modules unresolved.

- [ ] **Step 3: Implement ThemePicker**

Create `src/features/settings/ui/ThemePicker.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { readTheme, THEMES, THEME_STORAGE_KEY, type Theme } from '../theme';
import { applyTheme } from '../use-theme';
import { setThemeAction } from '../actions';

const LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/**
 * Three states, and "System" is the default.
 *
 * The stored preference cannot be read during render (it lives in localStorage, and this component
 * is prerendered at build time by `output: 'export'`), so the control renders as "System" first and
 * corrects in an effect. That is a one-frame correction to a small control, not a theme flash — the
 * PAGE theme is already correct before first paint, stamped by the inline script in layout.tsx.
 *
 * Choosing "System" REMOVES the data-theme attribute rather than setting it, so
 * `color-scheme: light dark` (globals.css) takes over and an OS switch is followed live with no JS.
 *
 * <html> is stamped here, on click, rather than waiting for the write to reach OPFS and the
 * data-version bump to re-run useTheme — a control whose entire job is to be instant cannot afford
 * that round trip. The hook still owns the localStorage cache; this owns only the current frame.
 */
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    setTheme(readTheme(localStorage.getItem(THEME_STORAGE_KEY)));
  }, []);

  function choose(value: Theme) {
    setTheme(value);
    applyTheme(value);
    void setThemeAction(value);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend id="theme-legend" className="text-sm font-medium">
        Theme
      </legend>
      <div
        role="radiogroup"
        aria-labelledby="theme-legend"
        className="flex gap-1 rounded-[var(--radius-md)] border p-1"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
      >
        {THEMES.map((value) => {
          const active = value === theme;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(value)}
              className="tap flex-1 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]"
              style={
                active
                  ? { background: 'var(--color-action)', color: 'var(--color-on-action)' }
                  : { color: 'var(--color-muted)' }
              }
            >
              {LABELS[value]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 4: Implement AccentPicker**

Create `src/features/settings/ui/AccentPicker.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { ACCENTS, ACCENT_LABELS, ACCENT_STORAGE_KEY, readAccent, type Accent } from '../theme';
import { applyAccent } from '../use-theme';
import { setAccentAction } from '../actions';

/**
 * The accent axis, alongside ThemePicker's light/dark axis. Same three moves and the same reasons:
 * read the cache in an effect, stamp <html> on click, persist in the background.
 *
 * Choosing 'ink' REMOVES the attribute, so the default palette is the bare :root and can never
 * drift from it.
 *
 * Nine swatches in a 3x3 grid, not a wrapping flex row: `flex-wrap` with `flex-1` packs as many
 * 44px-minimum targets into the first line as fit and stretches the remainder across the second,
 * which on a 412px column gives an uneven split. A grid sized by COUNT cannot do that.
 */
export function AccentPicker() {
  const [accent, setAccent] = useState<Accent>('ink');

  useEffect(() => {
    setAccent(readAccent(localStorage.getItem(ACCENT_STORAGE_KEY)));
  }, []);

  function choose(value: Accent) {
    setAccent(value);
    applyAccent(value);
    void setAccentAction(value);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend id="accent-legend" className="text-sm font-medium">
        App colour
      </legend>
      <div
        role="radiogroup"
        aria-labelledby="accent-legend"
        className="grid grid-cols-3 gap-1 rounded-[var(--radius-md)] border p-1"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
      >
        {ACCENTS.map((value) => {
          const active = value === accent;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              // Every swatch stamps its own palette, ink included. Leaving the default unstamped
              // makes it inherit from :root, so the first dot shows whatever is CURRENTLY selected
              // instead of the ink it offers. <html> still goes unstamped for ink — there the
              // absence is the point, and globals.css keeps the two definitions equal.
              data-accent={value}
              onClick={() => choose(value)}
              className="tap flex min-h-11 flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] px-1 py-2 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]"
            >
              {/* `var(--action)`, NOT `var(--color-action)` — and this is the whole reason the
                  swatches can preview a palette at all.

                  Tailwind's @theme emits `--color-action: var(--action)` inside `:root`. A custom
                  property is substituted at computed-value time ON THE ELEMENT THAT DECLARES IT, so
                  `--color-action` resolves against :root's `--action` and what inherits down is the
                  finished colour — this button's own `--action`, set by the [data-accent] block, is
                  never consulted, and every swatch paints the CURRENT accent instead of its own.
                  Reading the raw token resolves here, where the override actually lives.

                  Not colour alone: the chosen palette carries a tick and a ring, so the selection
                  survives greyscale and colour blindness. */}
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: 'var(--action)',
                  outline: active ? '2px solid var(--color-text)' : 'none',
                  outlineOffset: '2px',
                }}
              >
                {active ? (
                  <svg viewBox="0 0 16 16" className="h-4 w-4" style={{ fill: 'var(--on-action)' }}>
                    <path d="M6.2 11.8 2.9 8.5l1.1-1.1 2.2 2.2 5.8-5.8 1.1 1.1z" />
                  </svg>
                ) : null}
              </span>
              {/* Named, not just shown: plum and rose sit 40 degrees apart, and telling them apart
                  by a 28px dot alone is a memory test rather than a choice. */}
              <span
                className="text-xs"
                style={{
                  color: active ? 'var(--color-text)' : 'var(--color-muted)',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {ACCENT_LABELS[value]}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm test -- src/features/settings/ui/ThemePicker.test.tsx src/features/settings/ui/AccentPicker.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 6: Gates and commit**

```bash
npm run format:files src/features/settings/ui/ThemePicker.tsx src/features/settings/ui/ThemePicker.test.tsx src/features/settings/ui/AccentPicker.tsx src/features/settings/ui/AccentPicker.test.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/features/settings/ui/ThemePicker.tsx src/features/settings/ui/ThemePicker.test.tsx src/features/settings/ui/AccentPicker.tsx src/features/settings/ui/AccentPicker.test.tsx
git commit -m "feat(features): add the theme and accent pickers" -m "Two radiogroups that apply on click rather than on submit: a control whose result is the whole screen changing colour does not need a Save button to confirm it, and cannot afford the round trip to OPFS before the colour moves. Each stamps <html> itself and persists in the background." -m "Each accent swatch carries its own data-accent and paints itself with the RAW var(--action) rather than var(--color-action). That is not a style preference: a custom property is substituted at computed-value time on the element that declares it, so the Tailwind name resolves against :root and every swatch would paint the currently selected colour instead of the one it offers. A test pins the stamping so the bug cannot come back." -m "Selection is never colour alone — the chosen palette carries a tick and a ring, and every swatch is named, because two of these sit close enough that a 28px dot is a memory test." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Surface it in Settings, and verify in a browser

**Files:**

- Modify: `src/app/settings/page.tsx` (new section above the "Category icons" one at line ~130)

**Interfaces:**

- Consumes: `ThemePicker`, `AccentPicker` (Task 8).
- Produces: nothing.

- [ ] **Step 1: Add the imports**

In `src/app/settings/page.tsx`, beside the other feature imports:

```tsx
import { ThemePicker } from '@features/settings/ui/ThemePicker';
import { AccentPicker } from '@features/settings/ui/AccentPicker';
```

- [ ] **Step 2: Add the panel**

Insert immediately **above** the `<section>` containing the "Category icons" form:

```tsx
      {/* Not a form, and deliberately so: both controls apply on click, so neither uses this page's
          withSaveToast submit pattern. The two axes are independent — light/dark decides which half
          of every light-dark() pair resolves, the accent decides which set of pairs is in play. */}
      <section className="panel flex flex-col gap-4 p-5">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <ThemePicker />
        <AccentPicker />
        <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
          Stored with your ledger, so a restored backup brings your appearance with it. “System”
          follows your phone’s own light/dark setting as it changes.
        </p>
      </section>
```

- [ ] **Step 3: Run the gates**

```bash
npm run format:files src/app/settings/page.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all PASS.

- [ ] **Step 4: Verify in a real browser — this is the gate the suite cannot stand in for**

The tests run against the Node shim and jsdom. They prove the queries and the markup, and they prove
nothing about how any of this looks. Run `npm run dev:web` and drive `127.0.0.1:4010` at a 412px
viewport. Check each of these and report what you see rather than assuming:

1. **Settings → Appearance.** All three theme buttons and all nine swatches render. Each swatch is a
   different colour — if they are all the same, the raw-token indirection is broken.
2. **Light mode.** Switch to Light. Walk Home, `/records`, `/analytics`, `/budgets`, the keypad, and
   Settings. Look for anything that vanished: a white-on-white icon, an invisible border, a
   disappeared "selected" chip. Those are the failure mode a ratio check cannot catch.
3. **Home in both themes.** The donut and the FAB in one view is the only place the accent and the
   category hues genuinely share a screen. Try `teal` and `clay`, the two palettes closest to a
   donut slice (3° each), and confirm the FAB still reads as a control rather than a slice.
4. **The keypad's category picker.** `--color-selected` sits directly under a category disc there.
   Confirm the selected chip is still legible as "selected" under each of a few palettes.
5. **System.** Set the theme to System and flip the OS between light and dark with the app open. It
   should follow live, with no reload.
6. **No flash.** Choose Dark with a light OS (or the reverse), then hard-reload. The correct theme
   must be present on the first painted frame.
7. **A fresh ledger.** In a private window, confirm an untouched install renders exactly the
   v1.14.0 appearance: no `data-theme` and no `data-accent` on `<html>`.

Fix what this finds before committing. Colour values moved at this step are expected — the spec says
so; `globals.test.ts` must still pass afterwards.

- [ ] **Step 5: Verify the backup round trip**

In Settings, choose a non-default theme and accent, then Backup → export. Wipe all data, then
restore that file. The appearance must come back with it (this is what makes the settings table the
right home rather than localStorage).

- [ ] **Step 6: Re-run the gates and commit**

```bash
npm run format:files src/app/settings/page.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
git add -A
git commit -m "feat(app): put the appearance controls in Settings" -m "One Appearance panel above Category icons, holding both axes. Not a form: both controls apply on click, so neither needs this page's withSaveToast submit pattern — the confirmation is the screen changing colour." -m "Verified in a browser at 412px in both themes and across the palettes, which is the gate the suite cannot stand in for: the tests run against jsdom and the Node shim, so they prove the queries and the markup and nothing about whether an icon went white-on-white." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** Every section maps to a task: token migration → 3; accent palettes and the `ink ==
:root` pin → 4; storage and the backup path → 5; the reconciler and the optimistic stamp → 6;
pre-paint script and the `themeColor` fix → 7; both pickers including the raw-token trick → 8; the
Settings panel and all seven browser checks → 9; the contrast test → 2, extended in 3 and 4.

Two spec items are folded into a task rather than standing alone, deliberately: **rewriting the
`globals.css` comment that bans an accent** is part of Task 3 Step 3 (it is the same edit, and
splitting them would leave one commit whose code and comment disagree), and **`--color-action-hover`
replacing `.btn-primary:hover`** is Task 3 Step 5 for the same reason.

**Simplifications found while planning, and recorded here so they are not mistaken for omissions.**
The spec said each accent block would declare five tokens. It declares three: `--color-focus-ring`
`--color-selected` is a `color-mix()` of `--action` (so a new palette cannot forget it).

**Amended after a pre-flight check against the codebase — three claims in the first draft were
wrong.** They are recorded rather than quietly edited, because the same class of error is what the
previous slice's ledger names as the cause of all eight of its defects: asserting facts about the
repo from memory instead of tracing them.

1. The plan said "the app currently has no contrast test" and created `src/app/contrast.test.ts`.
   **`src/app/globals.test.ts` already exists** with `token`, `luminance`, `contrast` and `hue`
   written. A second file would have duplicated the colour maths verbatim. Tasks 2, 3 and 4 now
   extend the existing file.
2. The plan said no existing test reads a raw hex out of `globals.css`, and expected Task 3 to leave
   the suite passing. **Every assertion in that file reads one**, through a hex-only regex that
   throws the moment a value becomes `light-dark(...)`. Task 2 now exists to teach the helper about
   pairs while the palette is still untouched.
3. The plan called the category palette `DONUT_COLORS`. The export is **`SLICE_COLORS`**.

**And one design decision reversed on evidence.** The first draft declined to contrast-check
`--color-selected`, on the grounds that a 10-12% lift cannot push text below its floor. That is true
and answers the wrong question. The previous palette slice shipped a **Critical** — a selected tile
at ~1.02:1 that no one could see — and its own final review named the root cause as
`globals.test.ts`'s hex-only helper never being able to measure `--color-selected` at all. Declining
the same check while making that token accent-derived across nine palettes would have reopened a
wound this repo already has. Task 4 measures the composited lift per palette per theme.

Measuring it also changed a value: the spec's matched 10% light / 12% dark gives 1.20:1 in light
against 1.32:1 in dark, because a deep tint on a light ground lifts less than a pale tint on a dark
one. The plan uses **14% light / 12% dark**, which evens the lift at 1.29-1.43:1 across all nine
palettes and both grounds.

**Type consistency.** `Theme`/`Accent` are defined in Task 1 and used with those names in 5, 6, 8.
`applyTheme`/`applyAccent` are exported from `use-theme.ts` in Task 6 and imported under those names
in Task 8. `setThemeAction`/`setAccentAction` take a typed value in Task 5 and are called that way in
Task 8. In `globals.test.ts`, the theme-aware `token(name, theme, scope?)` and `THEMES` are
established in Task 2 and reused by name in Tasks 3 and 4, and `channels`/`contrast`/`hue` are the
file's pre-existing helpers — reuse them rather than writing second copies.

**One naming collision to watch.** `globals.test.ts` defines a local `type Theme = 'light' | 'dark'`
and a local `THEMES` holding those two. `features/settings/theme.ts` exports a different `Theme`
(three states, including `'system'`) and a different `THEMES`. The test file imports nothing from
`theme.ts`, so there is no conflict — but do not "helpfully" wire them together: the test asks which
half of a pair to read, which is not the same question as what the user picked.
