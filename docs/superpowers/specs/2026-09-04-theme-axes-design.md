# Two theme axes: a light mode, and an accent the user picks

Date: 2026-09-04
Branch: `feat/theme-axes`
Status: approved, ready for planning
Follows: `2026-09-03-ledger-ink-design.md`, whose token contract this extends rather than replaces

## Why

The app ships one appearance: dark, hueless. That was a deliberate and recent decision, and it is
still the right default. But it is the _only_ option, and two reasonable preferences have nowhere to
go — a phone used outdoors wants a light ground, and a single-user app is exactly the kind of thing
whose owner should get to pick its colour.

Reference implementation for both axes is `/h/code/pordee` (`src/shared/theme.ts`,
`ThemeToggle.tsx`, `AccentPicker.tsx`, `globals.css`). The mechanism is borrowed. The palettes are
not: pordee's nine accents are saturated fills chosen for a different app with a different hue
budget.

## What ledger-ink actually decided, and what this overturns

`2026-09-03-ledger-ink-design.md` is two days old and this spec touches its core. Being precise
about the overlap matters, because the parts worth keeping are easy to throw out by accident.

**Kept, untouched:**

- The grammar. Three treatments, three meanings, no overlap: a fill means "the one next action", a
  near-white text-plus-arrow means "tappable", a lighter ground chip means "where you are". The
  failure ledger-ink fixed was one colour meaning six things. Nothing here re-merges them.
- Hue belongs to category identity. The seven `DONUT_COLORS` do not move, in either theme, under any
  accent.
- Red means over budget and errors (`c4a64a6`). `--color-gain` / `--color-loss` / `--color-warn`
  **never shift with the accent.** pordee shifts its status colours per palette; we do not, because
  ours carry more meaning than pordee's do.
- Dark stays the default. A user who never opens Settings sees exactly what shipped in v1.14.0.

**Overturned, deliberately:**

- `globals.css:33-38` says "The one next action per screen carries NO hue on purpose … Do not
  reintroduce an accent colour here." The ban is lifted; the _reasoning_ behind it is preserved by
  the mechanism in "The accent is a tint, not a fill" below. **That comment must be rewritten in the
  same commit that lifts the ban**, or the next reader — us, in a month — will trust a comment the
  code no longer honours.
- The dark values in the token contract become the dark half of a `light-dark()` pair. Their values
  do not change.

## Constraint re-measured

ledger-ink measured the occupied hue wheel in OKLCH and concluded a clean accent hue was "mostly
unavailable". That measurement was re-run for this spec and reproduces exactly:

```
 18  loss          126  donut 5       250  donut 4
 48  donut 1       158  gain          289  (old accent, now deleted)
 72  donut 3       198  donut 0       338  donut 6
 72  warn          226  donut 2
```

Every gap is under 55 degrees except 250 → 338, which is 88 — and that gap is 88 wide only because
ledger-ink deleted the violet accent that used to sit at 289. **Deleting the accent is what made
room for a user-chosen one.**

Even so, an eight-colour picker cannot fit in one 88-degree gap. What resolves it is not hue.

## The accent is a tint, not a fill

This is the load-bearing idea, and it is what lets the accent exist without contradicting
ledger-ink's reasoning.

ledger-ink's rule is that the action is _the maximum-contrast object on the page_. It reads that way
today because it is near-white on a dark ground. That property is about **lightness**, not about
having no hue. So the accent colours the action while keeping it the lightest thing in dark mode and
the darkest thing in light mode:

|            | fill                            | ink on it         |
| ---------- | ------------------------------- | ----------------- |
| dark mode  | pale tint of the hue, OKLCH L 86 | `--color-bg`      |
| light mode | deep tint of the hue, OKLCH L 30 | light `--color-bg` |

Two consequences, both good:

1. **Ink contrast is enormous** — every palette lands between 11.8:1 and 13.4:1, versus the 4.5:1
   floor. A saturated fill with white on it (pordee's approach) would have run near 4.5 and needed
   per-palette tuning.
2. **Hue collision stops mattering.** The donut band sits at L 62–66. The accent sits at L 86 or
   L 30 — 20 to 32 lightness points away. A pale mint FAB and a mid-teal donut slice share a hue at
   3 degrees and still cannot be confused, because they are not the same brightness, the same size,
   the same shape, or in the same part of the screen. This is why the palette below can include hues
   3 degrees off a donut slot, which a naive hue-distance rule would forbid.

`--color-selected` takes the same hue at low alpha. It already is a tint of the action colour today
(`rgba(231,235,244,0.10)` against action `#F2F5FC` — the same hue at a different intensity), so
letting the accent own both preserves the existing relationship rather than merging two treatments.

## Axis 1 — light / dark

`data-theme` on `<html>`, three states, and the default is _no attribute_:

| preference         | attribute            | effect                                              |
| ------------------ | -------------------- | --------------------------------------------------- |
| `system` (default) | none                 | `color-scheme: light dark` — follows the OS live, no JS |
| `light`            | `data-theme="light"` | `color-scheme: light`                                |
| `dark`             | `data-theme="dark"`  | `color-scheme: dark`                                 |

Every colour is declared **once**, as `light-dark(<light>, <dark>)`. Flipping `color-scheme` resolves
all of them. This replaces the usual three-block pattern (`:root`, a `prefers-color-scheme` block,
and an attribute block) in which the dark values appear twice and drift apart silently.

### The token contract, both halves

Dark is today's value, verbatim. Light is new, and every ratio below was computed, not estimated.

| token                   | light     | dark      | checked                                          |
| ----------------------- | --------- | --------- | ------------------------------------------------ |
| `--color-backdrop`      | `#e4e7f0` | `#06080c` | — (sits behind the phone frame)                  |
| `--color-bg`            | `#f7f8fc` | `#0c0f16` | —                                                |
| `--color-surface`       | `#ffffff` | `#141926` | —                                                |
| `--color-surface-2`     | `#eff1f8` | `#1d2333` | —                                                |
| `--color-border`        | `#aeb5ca` | `#4a5470` | 2.05:1 / 2.33:1 on surface — decorative, no floor |
| `--color-border-strong` | `#868ea7` | `#5b6684` | 3.26:1 / 3.07:1 on surface, floor 3              |
| `--color-text`          | `#101420` | `#e7ebf4` | 17.31:1 / 16.05:1 on bg                          |
| `--color-muted`         | `#535b73` | `#98a1ba` | 6.75:1 / 6.80:1 on surface                       |
| `--color-faint`         | `#646c84` | `#868fa8` | 4.63:1 / 4.86:1 on surface-2                     |
| `--color-gain`          | `#0d7a4d` | `#19c37d` | 5.37:1 / 7.64:1 on surface                       |
| `--color-loss`          | `#c2323f` | `#f0616d` | 5.49:1 / 5.54:1 on surface                       |
| `--color-warn`          | `#8a5200` | `#f5a524` | 6.39:1 / 8.60:1 on surface                       |

**`--color-gain` / `--color-loss` / `--color-warn` were nearly missed.** The first pass of this
design listed them as "unchanged". They are not: `#19c37d` on white is about 2.0:1 — not dim,
illegible. Every semantic colour needs a light half.

Accent-owned tokens (`--color-action`, `--color-on-action`, `--color-action-hover`,
`--color-selected`, `--color-focus-ring`) are in the next section; their `ink` values are the light
and dark halves of what `:root` declares.

### Not changed by this axis

- The dialog/sheet scrims, `rgba(0,0,0,0.5)` — a scrim is black under a light sheet too.
- `--shadow-1` / `--shadow-2` / the `.app-frame` glow — black shadows read on both grounds.
- `DONUT_COLORS` and `OTHER_COLOR` in `donut.ts` — L 62–66 and L 43, legible on both grounds.
- `categoryColor` / `categoryColorBold` / `discForeground` — the disc is its own ground for the glyph
  drawn on it, so it does not care what the page behind it is.

### One existing bug fixed on the way

`layout.tsx:29` sets `themeColor: '#101114'`, which is not `--color-bg` (`#0c0f16`) and has not been
since ledger-ink. It becomes a `prefers-color-scheme` pair matching both grounds.

## Axis 2 — accent

`data-accent` on `<html>`. `ink` is the default and stamps **no attribute**, so the shipped
ledger-ink look is literally what `:root` declares and cannot drift from it.

The blocks are written as bare `[data-accent='…']`, **not** `:root[data-accent='…']`. Custom
properties inherit, so an ordinary element carrying the attribute gets that palette for its own
subtree — which is how the picker draws its swatches without a second copy of every hex, and a
second copy is a copy that drifts. (pordee learned this the hard way: with the default palette
unstamped, every swatch inherited from `:root` and painted the _currently selected_ colour instead of
the one it was offering. Stamp every swatch, `ink` included; leave only `<html>` unstamped for
`ink`.)

Because these blocks carry the same specificity as `:root`, they win on **source order alone** — keep
them below `:root` or every palette silently stops applying.

Nine swatches in a 3×3 grid — the same count and layout pordee settled on for a 430px column, and
this frame is 412px. Generated at fixed OKLCH lightness/chroma per theme, so the set is reproducible
and adding a palette is one row of arithmetic rather than a taste decision:

```
dark   fill oklch(86% 0.075 H)   hover oklch(78% 0.085 H)   ink = --color-bg
light  fill oklch(30% 0.09  H)   hover oklch(22% 0.09  H)   ink = light --color-bg
```

Note the column order differs from the token-contract table above: that one is light-then-dark to
match the `light-dark()` argument order, this one leads with dark because dark is the default.

| name              | H   | dark fill | dark hover | light fill | light hover | ink contrast, dark / light | nearest donut |
| ----------------- | --- | --------- | ---------- | ---------- | ----------- | ------------ | ------------- |
| `ink` (default)   | —   | `#f2f5fc` | `#e7ebf4`  | `#161b2b`  | `#0c0f16`   | 17.6 / 16.1:1 | n/a           |
| `indigo`          | 272 | `#bfcfff` | `#a4b5ef`  | `#1f285a`  | `#0e1343`   | 12.4 / 13.1:1 | 22°           |
| `violet`          | 300 | `#d8c6fc` | `#bfabe6`  | `#352053`  | `#220b3d`   | 12.2 / 13.3:1 | 38°           |
| `plum`            | 330 | `#eec0e9` | `#d7a4d1`  | `#461943`  | `#30042e`   | 12.2 / 13.4:1 | 8°            |
| `rose`            | 10  | `#febdc6` | `#e8a1ab`  | `#511523`  | `#390011`   | 12.1 / 13.4:1 | 32°           |
| `clay`            | 45  | `#fcc2a9` | `#e6a68a`  | `#501a00`  | `#390400`   | 12.3 / 13.3:1 | 3°            |
| `olive`           | 120 | `#cad9a2` | `#b0c082`  | `#293300`  | `#161f00`   | 12.7 / 12.6:1 | 6°            |
| `teal`            | 195 | `#95e1e0` | `#71c9c8`  | `#003a3c`  | `#002527`   | 12.9 / 11.8:1 | 3°            |
| `azure`           | 235 | `#a1dafc` | `#80c1e6`  | `#003354`  | `#001e3d`   | 12.7 / 12.4:1 | 9°            |

`--color-selected` per palette is the fill at 12% alpha in dark, 10% in light. `--color-focus-ring`
follows the fill in dark and the hover in light, keeping the existing 2px offset.

These hexes are **starting values that pass the numbers**. They have not been looked at on a phone.
Verifying them at 412px in both themes is a required step, not a nicety — see "Done means".

## Storage and application

Follows `useFontScale` exactly, which is the pattern this repo already uses for an app-wide
appearance preference.

```
settings table (OPFS)  ← source of truth; rides in the backup automatically, because
  theme  = system | light | dark     catalog.ts:63 carries a generic SettingRow[] blob —
  accent = ink | indigo | …          a new key needs no catalog change

localStorage           ← cache read by the pre-paint script, and by nothing else
  moniflow_theme, moniflow_accent
```

- `features/settings/theme.ts` — pure values and guards: the two key lists, `isTheme`, `isAccent`,
  `readTheme`, `readAccent`. No DOM and no storage access, so it is unit-testable and the inline
  script can mirror it. Anything unreadable — absent, corrupt, another app's key — means the default.
- `features/settings/queries.ts` — `getTheme`/`setTheme`/`getAccent`/`setAccent`, mirroring the
  existing `FONT_SCALE_KEY` block.
- `features/settings/use-theme.ts` — one hook, called once in `AppShell`. On every data-version bump
  it reads the DB, stamps `<html>`, and refreshes the localStorage cache — so it also reconciles a
  cache that has drifted from OPFS.
- **The pickers stamp `<html>` optimistically on click, then persist.** Waiting for a write to OPFS
  and a data-version bump before the colour changes puts a visible delay on a control whose entire
  job is to be instant. `useFontScale` can afford that round trip because it is a form submit; a
  swatch cannot.
- `layout.tsx`'s pre-paint script reads both cache keys and stamps the two attributes. The accent is
  validated against an inlined literal list, because the value is interpolated into an attribute that
  CSS then selects on. The script cannot import a module, so both storage keys are duplicated there —
  `theme.test.ts` pins them on the module side.

## UI

Two controls in one new `<section className="panel">` on `/settings`, placed above "Category icons".

- **Theme** — three segmented buttons (system / light / dark) as a `role="radiogroup"`.
- **Accent** — a 3×3 grid of `role="radio"` swatches. Each carries its own `data-accent` and paints
  itself with `var(--action)`, the _raw_ token rather than `var(--color-action)`. This is not a style
  preference: Tailwind's `@theme` emits `--color-action: var(--action)` inside `:root`, and a custom
  property is substituted at computed-value time **on the element that declares it** — so
  `--color-action` resolves against `:root`'s `--action`, and every swatch paints the current accent
  instead of its own. Reading the raw token resolves where the override actually lives.
- Selection is never colour alone: the chosen swatch carries a tick and a ring, and each swatch is
  named. Two of these palettes differ by well under 40°, and telling them apart by a 28px dot alone
  is a memory test rather than a choice.

Both apply on click. Neither is a form, so neither uses the page's `withSaveToast` submit pattern — a
control whose result is the entire screen changing colour does not need a toast to confirm it.

## Testing

The app currently has **no contrast test**. This change multiplies the colour surface by 2 themes ×
9 palettes; nobody will catch a 3.9:1 by eye across that.

- **`src/app/contrast.test.ts` (new).** Parses `globals.css` itself, walks `:root` and every
  `[data-accent]` block, and checks each documented pair in **both halves of every `light-dark()`**.
  It also pins `[data-accent='ink']` equal to `:root`, so the duplicated default cannot drift.
  Parsing the stylesheet rather than a TS copy of the values is the point — a test against a second
  copy of the palette proves only that the copy is self-consistent.
- **`theme.test.ts`** — the guards, and the storage-key strings the inline script duplicates.
- **`use-theme.test.ts`** — `renderHook`, per the repo's custom-hook rule.
- **Render tests** for both pickers: the active option reports `aria-checked`, and clicking a swatch
  stamps `<html>`.
- **`schema-lockstep.test.ts` is unaffected** — no new column and no new table. The settings table
  already exists and takes arbitrary keys.

## Scope

In: the token migration, the two axes, the two pickers, the hook, the pre-paint script, the contrast
test, the `themeColor` fix, and rewriting the `globals.css` comment that bans an accent.

Out: a transition on theme switch (one instant repaint beats 200ms of every token in flight);
per-category theming; changing `DONUT_COLORS`; a high-contrast mode; syncing appearance across
devices by any route other than the backup file.

## Done means

1. `npm run typecheck`, `lint`, `format:check`, and `test` all pass.
2. `contrast.test.ts` passes for `:root` and all nine palettes, both halves.
3. **Driven in a browser at 412px** — the gate the test suite cannot stand in for. Both themes, and
   every palette at least glanced at, across Home (the donut and the FAB in one view: the one place
   accent and category hue genuinely share a screen), `/records`, the keypad's category picker
   (`--color-selected` sitting under a category disc), and `/settings`.
4. A fresh OPFS ledger with no stored preference renders exactly v1.14.0's appearance.
5. Restoring a backup taken after choosing a theme brings that theme back.

## Risks

- **The light palette is unproven.** It passes the ratios; ratios are a floor, not a design. Expect
  to move values after seeing it. The dark half is safe by construction — it is the shipped values.
- **`.btn-primary:hover` currently reads `var(--color-text)`**, justified by a comment saying the
  action is already the lightest thing so hover must dim rather than brighten. That reasoning dies
  with a hued action. `--color-action-hover` replaces it, and the comment goes with it.
- **Nine palettes is nine chances for a swatch that looks wrong on a real screen** even at a passing
  ratio. `ink` remaining the default limits the blast radius to users who went looking.
