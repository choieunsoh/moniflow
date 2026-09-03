# Ledger Ink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace moniflow's reflex violet-on-grey palette with a derived cool blue-black one whose primary action carries no hue, so the accent stops meaning six things and red stops meaning nothing.

**Architecture:** Five tasks. Task 1 rewrites the token contract and adds a test that parses `globals.css` and asserts measured contrast, so the palette can never silently drift below AA. Task 2 retargets the component classes in `globals.css` itself. Task 3 sweeps the roughly 94 component-level accent references into the three-treatment grammar. Task 4 gives red back its meaning. Task 5 is a browser pass, which is the only check that can see a palette.

**Tech Stack:** Tailwind CSS v4 (`@theme` tokens in `src/app/globals.css`), Next.js 16 static export, React 19, TypeScript 5.9 strict, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-ledger-ink-design.md`

**Branch:** `feat/ledger-ink` (created, spec committed as `29bfee5`)

## Global Constraints

- TypeScript: no `any`, no `as` casts, no `!` assertions, no `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error`. `type` over `interface`. `for..of` over `.forEach`.
- **No em dashes or en dashes** in any code, comment, commit message, or user-facing string added by this plan. The existing files are full of pre-existing ones: leave those, add none.
- **Colours only.** No type, spacing, radius, motion, z-scale, schema, layout or copy change. If a task seems to need one, it is out of scope: report it instead.
- Every colour in a component comes from a CSS custom property. No raw hex outside `globals.css`, with the single documented exception of `SLICE_COLORS` in `donut.ts` and the category hue system in `color.ts`, neither of which this plan touches.
- Never add the `Claude-Session:` trailer. `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` is correct.
- Commit with repeated `-m` flags. Never `git commit -F <file>` and never a heredoc: the wrapped git on this machine receives no stdin and the commit-msg hook rejects the message as empty.
- Commit format `type(scope): description`, single-word scope from `db`, `app`, `features`, `shared`.
- Before each commit run, separately: `npm run format:files <changed files>`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`. All must pass.

## The token contract, for reference by every task

```
--color-backdrop        #06080C
--color-bg              #0C0F16
--color-surface         #141926
--color-surface-2       #1D2333
--color-border          #4A5470   2.33:1 on surface, decorative edges
--color-border-strong   #5B6684   3.07:1 on surface, interactive edges
--color-text            #E7EBF4   16.05:1 on bg
--color-muted           #98A1BA    6.80:1 on surface
--color-faint           #868FA8    4.86:1 on surface-2
--color-action          #F2F5FC   the one next action, no hue
--color-on-action       #0C0F16   17.56:1 on action
--color-selected        rgba(231, 235, 244, 0.1)
--color-focus-ring      #F2F5FC
--color-on-fill         #ffffff   RENAMED from --color-on-accent, ink on a saturated fill
```

Removed: `--color-accent`, `--color-accent-hover`, `--color-accent-text`, `--color-accent-soft`, `--color-accent-ring`.
Unchanged: `--color-gain`, `--color-loss`, `--color-warn`, radii, shadows, motion, z-scale.

---

### Task 1: The token contract and a test that pins it

**Files:**
- Modify: `src/app/globals.css` (the `@theme` block, lines 14 to 41, and the `:root` block, lines 44 to 51)
- Create: `src/app/globals.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the token names listed in the contract above. Tasks 2, 3 and 4 reference them by those exact names.

- [ ] **Step 1: Write the failing test**

Create `src/app/globals.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SLICE_COLORS } from '@features/entries/donut';

// The palette is the one part of the design system that looks untestable and is not. Two properties
// are machine-checkable from the token values themselves, so a future edit that drops a colour below
// AA fails here rather than in someone's eyes six months later.
//
// The colour maths is duplicated from donut.test.ts on purpose, matching how that file keeps its own
// local hueOf: a runtime module would ship this arithmetic into the browser bundle to serve nothing
// but tests.
const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'globals.css'), 'utf-8');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (match === null) throw new Error(`token --${name} not found in globals.css`);
  return match[1];
}

function channels(hex: string): number[] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hue(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
}

describe('text contrast', () => {
  it.each([
    ['color-text', 'color-bg', 4.5],
    ['color-text', 'color-surface', 4.5],
    ['color-muted', 'color-bg', 4.5],
    ['color-muted', 'color-surface', 4.5],
    ['color-faint', 'color-surface-2', 4.5],
    ['color-on-action', 'color-action', 4.5],
  ])('%s on %s clears AA', (ink, ground, floor) => {
    expect(contrast(token(ink), token(ground))).toBeGreaterThanOrEqual(floor);
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
    expect(contrast(token(mark), token(ground))).toBeGreaterThanOrEqual(3);
  });

  // The decorative edge is deliberately quieter than 3:1: a panel is already delimited by its own
  // surface lightness, and a blanket 3:1 outlines every card. It must still be visible, which the
  // measured 1.29:1 of the previous palette was not.
  it('the decorative border is visible without outlining every card', () => {
    const ratio = contrast(token('color-border'), token('color-surface'));
    expect(ratio).toBeGreaterThanOrEqual(2);
    expect(ratio).toBeLessThan(3);
  });
});

describe('hue separation', () => {
  const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

  it.each(['color-gain', 'color-loss'])('no category colour impersonates --%s', (name) => {
    const reserved = hue(token(name));
    for (const slice of SLICE_COLORS) {
      expect(apart(hue(slice), reserved)).toBeGreaterThan(25);
    }
  });
});

describe('the accent is gone', () => {
  // The whole point of this slice: one treatment, one meaning. A reintroduced accent token is how
  // the six-meanings problem comes back.
  it.each([
    'color-accent',
    'color-accent-hover',
    'color-accent-text',
    'color-accent-soft',
    'color-accent-ring',
  ])('--%s no longer exists', (name) => {
    expect(css).not.toContain(`--${name}:`);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/app/globals.test.ts`
Expected: FAIL. `--color-action` and `--color-focus-ring` do not exist yet so `token()` throws, and the "accent is gone" cases fail because the accent tokens are still present.

- [ ] **Step 3: Rewrite the token block**

In `src/app/globals.css`, replace the surfaces, ink and accent groups (currently lines 14 to 32) with:

```css
  /* Surfaces (canvas → raised). Cool blue-black, the colour of ink on a bank statement: the ground
     is derived from the subject rather than defaulted to a neutral grey. */
  --color-backdrop: #06080c; /* behind the phone frame on wide viewports, dimmer than the canvas */
  --color-bg: #0c0f16;
  --color-surface: #141926;
  --color-surface-2: #1d2333;
  /* Two steps by role. The decorative edge is deliberately under 3:1 because a panel is already
     delimited by its surface lightness and a blanket 3:1 outlines every card; the strong edge is for
     boundaries that mean "tap here" (inputs, keys, dividers, chrome) and clears 3:1. */
  --color-border: #4a5470;
  --color-border-strong: #5b6684;

  /* Ink */
  --color-text: #e7ebf4; /* 16.1:1 on bg */
  --color-muted: #98a1ba; /* 6.8:1 on surface */
  --color-faint: #868fa8; /* tertiary, 4.9:1 on surface-2: clears AA anywhere */

  /* The one next action per screen. It carries NO hue on purpose: it is the maximum-contrast object
     on the page. That frees the entire hue budget for category identity, which is the only place a
     hue in this app carries data. Do not reintroduce an accent colour here. */
  --color-action: #f2f5fc;
  --color-on-action: #0c0f16;
  /* Ink on a saturated fill: a category disc, an account icon, a destructive button. Named for its
     job rather than for the accent it used to sit on, because it never had anything to do with it. */
  --color-on-fill: #ffffff;
```

- [ ] **Step 4: Rewrite the non-Tailwind vars**

Replace the accent-soft and accent-ring declarations (currently lines 44 to 51) with:

```css
/* Non-Tailwind design vars: selection tint, elevation, motion, z-scale. */
:root {
  /* "Where you are": a lift of the ground itself, not a colour. The active tab and the active view
     toggle wear this, so location never competes with the one action on the screen. */
  --color-selected: rgba(231, 235, 244, 0.1);
  /* WCAG 2.2 SC 1.4.11 wants 3:1 for a focus indicator. The action colour clears it everywhere by a
     wide margin, and the existing 2px offset keeps it legible even on the action button itself. */
  --color-focus-ring: #f2f5fc;
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- src/app/globals.test.ts`
Expected: PASS, every case.

Note the suite will now have OTHER failures and the build will break, because components still reference the removed tokens. That is expected and Tasks 2 and 3 fix it. Do not chase those here.

- [ ] **Step 6: Prove the test can fail**

Temporarily change `--color-muted` to `#3a4050` in `globals.css`, run `npm test -- src/app/globals.test.ts`, and confirm the muted-on-surface case goes red. Then restore the correct value and re-run to confirm green. Report both outputs.

- [ ] **Step 7: Commit**

```bash
npm run format:files src/app/globals.css src/app/globals.test.ts
git add src/app/globals.css src/app/globals.test.ts
git commit -m "feat(app): derive the palette and pin it with a contrast test" -m "The ground was a neutral grey that came from nowhere and the accent was the violet every AI-built finance app reaches for. The ground is now cool blue-black, the colour of ink on a bank statement, and the one next action per screen carries no hue at all: it is the maximum-contrast object on the page." -m "That frees the whole hue budget for category identity, which is the only place a hue here carries data, and it is what stops one colour meaning six things. Borders move to two steps by role, because a blanket 3:1 outlines every card while 1.29:1 was invisible." -m "globals.test.ts parses the token values and asserts contrast and hue separation, so a future edit that drops a colour below AA fails in CI rather than in someone's eyes."
```

Typecheck, lint and the full suite are NOT expected to pass at this commit. Run them anyway and record the failures in your report so the next task knows exactly what it inherits.

---

### Task 2: Retarget the component classes in globals.css

**Files:**
- Modify: `src/app/globals.css` (`:focus-visible`, `.btn-primary`, `.btn-ghost`, `.panel`, `.chip`, `.menu`, `.toast`)

**Interfaces:**
- Consumes: the tokens from Task 1.
- Produces: `.btn-primary` as the near-white action, `.btn-ghost` unchanged in role. Task 3 relies on both.

- [ ] **Step 1: Retarget the focus ring**

Replace:

```css
:focus-visible {
  outline: 2px solid var(--color-accent-ring);
```

with:

```css
:focus-visible {
  outline: 2px solid var(--color-focus-ring);
```

- [ ] **Step 2: Retarget the primary button**

Replace the `.btn-primary` rules:

```css
.btn-primary {
  background: var(--color-action);
  color: var(--color-on-action);
}
.btn-primary:hover {
  /* The action is already the lightest thing on the page, so hover dims rather than brightens. */
  background: var(--color-text);
}
```

- [ ] **Step 3: Put the strong border on interactive edges**

`.btn-ghost` and `.menu` are interactive boundaries and take the strong edge. Replace `.btn-ghost`'s border and `.menu`'s border:

```css
.btn-ghost {
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border-strong);
}
```

`.menu` already uses `var(--color-border-strong)` and needs no change: confirm by reading it rather than editing blindly.

`.panel` keeps `var(--color-border)`: it is a decorative edge.

- [ ] **Step 4: Retarget the app-frame ring**

`.app-frame`'s `@media (min-width: 420px)` box-shadow uses `var(--color-border-strong)`, which still exists and is now more visible. No change needed. Confirm by reading.

- [ ] **Step 5: Run the token test and the suite**

Run: `npm test -- src/app/globals.test.ts`
Expected: PASS.

Run: `npm test`
Expected: still some failures from components not yet retargeted (Task 3). Record which, do not fix them here.

- [ ] **Step 6: Commit**

```bash
npm run format:files src/app/globals.css
git add src/app/globals.css
git commit -m "feat(app): move the shared component classes onto the action token" -m "The primary button becomes the maximum-contrast object rather than a coloured fill, and the focus ring follows it. Hover dims instead of brightening, because the action is already the lightest thing on the screen." -m "Interactive edges (the ghost button, the floating menu) take the strong border; decorative panel edges keep the quiet one."
```

---

### Task 3: Sweep the component-level accent references

This is the widest task in the slice. Roughly 94 references across about 20 files.

**Files:** every file returned by the grep in Step 1. Known to include `src/app/page.tsx`, `src/app/records/page.tsx`, `src/app/budgets/page.tsx`, `src/app/month/page.tsx`, `src/app/report/page.tsx`, `src/app/about/page.tsx`, `src/app/entries/edit/page.tsx`, `src/app/recurring/edit/page.tsx`, `src/shared/ui/BottomBar.tsx`, `src/shared/ui/ViewToggle.tsx`, `src/features/entries/ui/Breakdown.tsx`, `src/features/entries/ui/Keypad.tsx`, `src/features/entries/ui/SearchBox.tsx`, `src/features/entries/ui/SwipeRow.tsx`, `src/features/entries/ui/SpendHeatmap.tsx`, `src/features/entries/ui/CollapseAllButton.tsx`, `src/features/entries/ui/CycleDeltaCard.tsx`, `src/features/entries/ui/EmptyLedger.tsx`, `src/features/entries/ui/ForwardCards.tsx`, `src/features/entries/ui/HeaderFilterChip.tsx`, `src/features/accounts/ui/AccountMergeButton.tsx`, `src/features/accounts/ui/DeleteAccountButton.tsx`, `src/features/categories/ui/DeleteCategoryButton.tsx`.

**Interfaces:**
- Consumes: `--color-action`, `--color-on-action`, `--color-selected`, `--color-on-fill`, `--color-text`, `--color-muted` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Enumerate every reference before changing any**

Run:

```bash
grep -rn "color-accent" src --include=*.tsx --include=*.ts | grep -v "\.test\." > /tmp/accent-refs.txt
wc -l < /tmp/accent-refs.txt
```

Read that file. Write the list into your report grouped by the treatment you will apply, BEFORE editing. That grouping is the actual work of this task; the edits are mechanical once it is right.

- [ ] **Step 2: Apply the three-treatment grammar**

The mapping, which is the whole point of the slice:

| Old | New | Rule |
|---|---|---|
| `var(--color-accent)` as a **fill on the one primary action** (the FAB in `BottomBar.tsx`) | `var(--color-action)` with `var(--color-on-action)` ink | near-white fill means "the one next action" |
| `var(--color-accent-soft)` behind the **active tab pill or active toggle** | `var(--color-selected)` | a lift of the ground means "where you are" |
| `var(--color-accent-text)` on **tappable text** ("See all", "Back up now", "n categories in Other", "Collapse all") | `var(--color-text)`, and the element must carry an arrow or an underline | tappable text announces itself by mark, not by hue |
| `var(--color-accent)` / `var(--color-accent-text)` used **decoratively** (keypad operators, a chart accent, a heatmap scale) | `var(--color-muted)` or `var(--color-text)` as the surrounding hierarchy requires | decoration gets no action colour |
| `var(--color-on-accent)` as **ink on a saturated fill** (category disc, account icon, destructive button) | `var(--color-on-fill)` | renamed only, same value, same job |

**The affordance rule is not optional.** Any text that loses its colour MUST gain a visible mark: an arrow (`→`) if it navigates, or an underline if it does not. A link that reads as body text is a Law 4 violation and a worse defect than the one this slice is fixing. If you find tappable text where neither an arrow nor an underline fits the layout, stop and report it rather than shipping unmarked text.

- [ ] **Step 3: Verify exactly one action fill per screen**

Run:

```bash
grep -rn "color-action" src --include=*.tsx | grep -v "\.test\."
```

Read every hit and confirm no single route renders two. `.btn-primary` counts as one wherever it appears. If a screen genuinely has two (Settings has six Save buttons), the extra ones become `.btn-ghost`. Report any screen where that judgement was needed.

- [ ] **Step 4: Confirm no accent reference survives**

Run:

```bash
grep -rn "color-accent" src --include=*.tsx --include=*.ts --include=*.css | grep -v "\.test\."
```

Expected: no output. If anything remains, it was missed.

- [ ] **Step 5: Run the gates**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
```

Expected: all pass. `globals.test.ts`'s "the accent is gone" cases and the build both depend on this task being complete.

- [ ] **Step 6: Commit**

```bash
npm run format:files <every file you changed>
git add -A src
git commit -m "feat(app): give every accent reference one meaning" -m "The accent meant six things at once: the one action, the current location, the current selection, every link, the keypad's arithmetic operators and all six Save buttons. A colour that means six things means nothing, which is why the review could not tell what purple was for." -m "Three treatments now map to three meanings with no overlap: a near-white fill is the one next action, a lifted ground chip is where you are, and tappable text carries an arrow or an underline instead of a hue. Text that lost its colour gained a mark, so nothing became less discoverable."
```

---

### Task 4: Give red back its meaning

**Files:**
- Modify: `src/features/entries/ui/SwipeRow.tsx`, `src/features/recurring/ui/RuleRow.tsx`, and any other file the Step 1 grep shows rendering an ordinary amount in `--color-loss`.

**Interfaces:**
- Consumes: `--color-text`, `--color-loss`, `--color-gain` from Task 1.
- Produces: nothing.

- [ ] **Step 1: Enumerate**

```bash
grep -rn "color-loss\|color-gain" src --include=*.tsx --include=*.ts | grep -v "\.test\." > /tmp/loss-refs.txt
cat /tmp/loss-refs.txt
```

Sort each hit into one of three buckets and put the grouping in your report before editing:
- **an ordinary amount** (every row in `/records`, every rule in `/recurring`): becomes `var(--color-text)`
- **an over-budget or error state** (the budget meter's over state, the Danger zone, delete confirmations, `AnomalyBanner`, `WipeAllData`, `ConfirmDialog`): keeps `var(--color-loss)`
- **a refund** (`SwipeRow`'s positive amounts, `formatLedgerSpend` output): keeps `var(--color-gain)`

- [ ] **Step 2: Convert ordinary amounts to text colour**

Every row in `/records` and `/recurring` is an expense, so red on all of them was information-free and it made the one genuine exception harder to see. Change those amount colours to `var(--color-text)`. Do not change the gain-green on refunds: a refund is a real exception and already carries an explicit `+` prefix, so it is not colour-alone.

- [ ] **Step 3: Confirm red now appears only where it means something**

```bash
grep -rn "color-loss" src --include=*.tsx | grep -v "\.test\."
```

Read every surviving hit. Each must be an over-budget state, a destructive action, or an error. Report the list.

- [ ] **Step 4: Run the gates**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
```

Expected: all pass. If a render test asserted a red amount, that assertion encoded the defect: update it and say so explicitly in your report rather than quietly.

- [ ] **Step 5: Commit**

```bash
npm run format:files <every file you changed>
git add -A src
git commit -m "feat(features): reserve red for over budget and errors" -m "Every amount in records and recurring was red, but every row there is an expense, so the whole list was red and the colour carried no information. The one genuine exception, a refund, was green inside a field of red and therefore harder to see, not easier." -m "Ordinary amounts now render in text colour. Red is left to the meanings it should have had all along: over budget, destructive, error. Refunds keep gain-green, which is not colour-alone because they already carry an explicit plus prefix."
```

---

### Task 5: Drive it in a browser

A palette is a thing you look at. Tests can prove a contrast ratio; only a screen can tell you whether the result is drab, glaring or right.

**Files:** none modified unless a defect is found.

- [ ] **Step 1: Confirm the dev server**

A dev server may already be running on port 4010 against the user's REAL ledger. Check with `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4010/` before starting another. Never write to that data, never restore a backup.

- [ ] **Step 2: Screenshot every route at 390x844**

`/`, `/records`, `/budgets`, `/analytics`, `/categories`, `/accounts`, `/currency`, `/recurring`, `/month`, `/year`, `/report`, `/trips`, `/settings`, `/about`, `/entries/new`.

- [ ] **Step 3: Answer the three questions the spec's Risks section raises**

These are the reasons this could be wrong, and they are answerable only by looking:
1. **Does the chrome read as drab?** The bet is that the data becomes the colourful thing. If the app reads as lifeless, the documented fallback is a single restrained hue for tappable text only, which is one token.
2. **Is the near-white FAB glaring?** It is large, bright and permanently near the thumb. If it dominates, the documented fallback is reducing its size or dropping it to `--color-text`, NOT reintroducing a hue.
3. **Did anything become less discoverable?** Every piece of text that lost its colour must carry an arrow or an underline. Verify by looking, not by grep.

- [ ] **Step 4: Measure contrast from rendered pixels**

Token values are not rendered values: opacity, blend and overlay can change what reaches the eye. Sample the real pixels for body text, muted text, the panel border and the action button, and confirm each meets the floor its test asserts.

- [ ] **Step 5: Confirm the category colours still read**

The whole premise is that hue now belongs to category identity. Open Home's donut and `/analytics`: the seven slice colours must still be distinguishable from each other and must not read as chrome against the new ground.

- [ ] **Step 6: Report**

Before and after screenshots of Home, `/records`, `/budgets` and the keypad. State plainly whether the three risk questions passed. If any failed, apply the documented fallback for that specific risk and nothing else.

---

## Self-Review

**Spec coverage:** the token contract maps to Task 1; the grammar's three treatments to Tasks 2 and 3; red's meaning to Task 4; the testing section to Task 1's `globals.test.ts`; the "done means" and "risks" sections to Task 5. The spec's note that `--color-on-accent` must survive as `--color-on-fill` appears in Task 1's contract and in Task 3's mapping table. No spec requirement is unimplemented.

**Placeholder scan:** no TBD, TODO, "handle edge cases" or "similar to Task N". Every code step carries its code. Task 3's file list is enumerated rather than described, and its Step 1 requires the implementer to produce the grouping before editing.

**Type consistency:** the token names in the contract block are used verbatim in Tasks 1, 2, 3 and 4: `--color-action`, `--color-on-action`, `--color-selected`, `--color-focus-ring`, `--color-on-fill`, `--color-border`, `--color-border-strong`. `SLICE_COLORS` is imported in `globals.test.ts` from `@features/entries/donut`, which is its existing export path.

**Known and deliberate:** Task 1 lands a commit where the build is broken, because the tokens are removed before their consumers are retargeted. This is why Task 1's Step 7 requires recording the inherited failures rather than hiding them, and why Tasks 2 and 3 must not be reordered or skipped. An alternative would be one enormous commit; a briefly red intermediate commit on a feature branch is the smaller evil, and the branch is never merged in that state.
