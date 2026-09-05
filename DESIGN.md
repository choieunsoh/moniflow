# Design

Visual system for moniflow — a calm, trustworthy, local-first money-flow tracker. It has **two
independent theme axes**: light/dark (following the OS by default) and a nine-palette accent. Every
colour is a token, declared exactly once, and `src/app/globals.test.ts` parses `globals.css` and
checks every ratio below in **both** themes. Read that test before changing any value.

## Theme

The mood is a quiet financial workspace: low ambient light, steady focus, nothing shouting. The
ground is a cool blue-black (dark) or a cool near-white (light) — the colour of ink on a bank
statement, derived from the subject rather than defaulted to neutral grey. Colour strategy is
**Restrained** (product floor): tinted-neutral surfaces carry the UI; the action colour appears only
on the primary action, the current selection, and focus — never as decoration.

### Axis 1 — light / dark, driven by `color-scheme` and nothing else

Every colour is declared ONCE as `light-dark(<light>, <dark>)`, so the three states are one
property:

| Root state           | `color-scheme` | Behaviour                        |
| -------------------- | -------------- | -------------------------------- |
| no attribute         | `light dark`   | follows the OS, live, with no JS |
| `[data-theme=dark]`  | `dark`         | forced dark on a light OS        |
| `[data-theme=light]` | `light`        | forced light on a dark OS        |

This replaces the usual three-block pattern (a `:root`, a `prefers-color-scheme` block and an
attribute block) in which the dark values appear twice verbatim and drift apart. **No colour may
have its only definition inside a media query or an attribute selector.**

### Axis 2 — the accent, nine palettes, three tokens each

`[data-accent]` blocks redeclare **only** `--action`, `--on-action` and `--action-hover`.
`--color-selected` and `--color-focus-ring` derive from `--action` in `:root`, so a new palette is
three lines and cannot forget them. The blocks are deliberately **not** scoped to `:root`: custom
properties inherit, so `AccentPicker` stamps `data-accent` on a plain swatch element and the swatch
paints itself with `var(--action)` — no second copy of every hex to drift.

Every hex is generated as an OKLCH tint of one hue at a fixed lightness per theme:

```
dark    fill oklch(86% 0.075 H)   hover oklch(78% 0.085 H)   ink = --color-bg
light   fill oklch(30% 0.09  H)   hover oklch(22% 0.09  H)   ink = light --color-bg
```

Palettes: `ink` (default, hueless), `indigo`, `violet`, `plum`, `rose`, `clay`, `olive`, `teal`,
`azure`. Those four lines are the **targets, not the shipped hexes** — at L 30 in sRGB there is no
room for C 0.09 in cyan or blue, so teal's light fill lands at L 31.6 C 0.054 and azure's hue drifts
17° between halves. That is sRGB running out of colour, not a mistake. Regenerate from the hue and
let the clipping fall where it does; do not hand-correct a palette to match the formula.

**No palette moves `--color-gain`, `--color-loss` or `--color-warn`** — those carry meaning (over
budget, refund, caution), and a colour that changes with a picker carries none. `globals.test.ts`
fails a block that tries.

## Color palette (OKLCH-reasoned, shipped as hex tokens in `globals.css @theme`)

Ratios are measured against `--color-surface`, not `--color-bg` — a panel is the lightest thing most
text sits on in dark, so clearing it clears everywhere. Both halves are listed as `light / dark`.

| Token                   | light     | dark      | Role                                                      |
| ----------------------- | --------- | --------- | --------------------------------------------------------- |
| `--color-backdrop`      | `#e4e7f0` | `#06080c` | Behind the phone frame on wide viewports                  |
| `--color-bg`            | `#f7f8fc` | `#0c0f16` | Canvas (the app frame)                                    |
| `--color-surface`       | `#ffffff` | `#141926` | Panels, cards — the light half **inverts** the ramp       |
| `--color-surface-2`     | `#eff1f8` | `#1d2333` | Raised: header, hover, selected                           |
| `--color-border`        | `#aeb5ca` | `#4a5470` | Decorative edge — 2.05 / 2.33, deliberately **under** 3:1 |
| `--color-border-strong` | `#868ea7` | `#5b6684` | Edges that mean "tap here" — 3.26 / 3.07                  |
| `--color-text`          | `#101420` | `#e7ebf4` | Primary ink — 17.31 / 16.05 on bg                         |
| `--color-muted`         | `#535b73` | `#98a1ba` | Secondary text — 6.75 / 6.80 on surface                   |
| `--color-faint`         | `#646c84` | `#868fa8` | Tertiary / labels — 4.63 / 4.86 on surface-2              |
| `--color-gain`          | `#0d7a4d` | `#19c37d` | Refund / positive — 5.37 / 7.64 on surface                |
| `--color-loss`          | `#c2323f` | `#f0616d` | Over budget / error — 5.49 / 5.54 on surface              |
| `--color-warn`          | `#8a5200` | `#f5a524` | Caution — 6.39 / 8.60 on surface                          |

Accent-owned, redeclared per palette (see above):

| Token                  | Value                                  | Role                                           |
| ---------------------- | -------------------------------------- | ---------------------------------------------- |
| `--color-action`       | `var(--action)`                        | The **one next action** per screen, plus focus |
| `--color-on-action`    | `var(--on-action)`                     | Ink on an action fill                          |
| `--color-action-hover` | `var(--action-hover)`                  | Action hover                                   |
| `--color-selected`     | `--action` at 14% (light) / 12% (dark) | "Where you are": a lift of the ground itself   |
| `--color-focus-ring`   | `var(--action)`                        | `:focus-visible` outline (SC 1.4.11)           |
| `--color-on-fill`      | `#ffffff` in both themes               | Ink on a saturated fill (rank badge, danger)   |

**The action is defined by LIGHTNESS, not by hue.** It is the maximum-contrast object on the page —
the lightest thing in dark, the darkest in light. That is what lets an accent tint it without
weakening it, and it is why `--color-focus-ring` can be one line rather than a per-palette
declaration: every palette clears 3:1 by construction. `globals.test.ts` asserts the action inverts
against the ground. Do not saturate these into a mid-lightness fill — that is the version that
competes with the category band.

**The selection lift is a floor for "measurable", not for "enough on its own."** The 14/12 split is
measured, not aesthetic: a matched 10/12 gave 1.20:1 in light against 1.32:1 in dark; 14/12 evens
them at 1.29–1.43:1 across all nine palettes and both grounds. A selected state must **also** carry
a border or a tick — this app shipped a selected tile at 1.02:1 that no one could see, precisely
because it leaned on the lift alone. `globals.test.ts` holds the floor; the components hold the
border.

**Contrast is verified, not assumed.** Body ≥4.5:1, large ≥3:1, focus indicators ≥3:1 (WCAG 2.2 SC
1.4.11). Gain/loss is never colour-only — always paired with a `+`/`−` sign (`formatSignedBaht`) so
it survives grayscale and colour blindness. Note that the status colours are **not** shared across
themes: `#19c37d` on white is ~2.0:1, so each gets a darkened light half rather than one value doing
both jobs.

### The chart palette is derived, not decorative

`SLICE_COLORS` (`features/entries/donut.ts`) is the seven-hue categorical ramp for the spending
donut and the ranked breakdown, plus a neutral `#4b5061` for the folded "Other" bucket. Every slice
sits in a tight band — **L 62–66, C 0.105–0.15** — so the ramp varies by hue alone and no category
looks louder than another. Two hue bands are reserved, and a slice may not enter either.

| Reserved              | Why a slice must not wear it                             |
| --------------------- | -------------------------------------------------------- |
| `--color-gain` (158°) | A green slice reads as a positive value, not a category. |
| `--color-loss` (18°)  | Likewise a red one reads as a negative.                  |

Worst shipped clearance is **26.9°** (`#da7134` against `--color-loss`). `donut.test.ts` measures
hue distance in OKLCH rather than comparing hex strings, because the failure mode is a NEAR miss:
the first ramp shipped `#7c5cff` against a `#7132f5` accent — different hex, same purple to the eye
— so the biggest category every cycle wore the colour reserved for actions.

**The accent is no longer a reserved hue band, and that is deliberate.** Since the accent axis
landed, `teal` sits **0.5°** from the slice `#03999d`. They do not compete because they separate by
lightness: an accent is at L 86 (dark) or L 30 (light) while every slice is at L 62–66, ~20 L points
apart. Hue belongs to category identity; lightness belongs to action. That inversion is the whole
reason nine accents can exist in an app whose hue budget is already spent.

> `donut.test.ts` still lists the retired `#7132f5` in its `RESERVED` map. It is inert — no such
> token exists in `globals.css` — so the test's real teeth are on gain/loss only.

Clearance is checked **adjacent**, not all-pairs: only four hues clear all-pairs once the bands are
reserved, and capping the ring at four categories is the worse trade. It holds because `LegendRow`
never leans on colour alone — every row carries the category glyph, name, count, amount and share.

## Typography

**One** typeface app-wide: **IBM Plex Sans** carries UI, prose, and figures alike. Self-hosted via
`next/font`. No monospace for numbers — a mono (IBM Plex Mono, Consolas…) draws a slashed/dotted
zero; Plex Sans draws a plain zero, which is the house rule for figures.

Fixed rem scale, product register — no fluid clamp (a phone-frame UI is viewed at one width, so
type is set with Tailwind size utilities, not a hero). Figures render in the same Plex Sans via
`.tnum`, which adds `font-variant-numeric: tabular-nums` (letter-spacing `-0.01em`) so amounts,
counts, and dates align in columns:

| Step  | Size / line-height / weight | Use                            |
| ----- | --------------------------- | ------------------------------ |
| h1    | `1.5rem` / 1.2 / 600        | Page title (budgets/settings…) |
| h2    | `1rem` / 1.3 / 600          | Panel / section title          |
| body  | `1rem` / 1.6 / 400          | Prose                          |
| small | `0.875rem` / 1.5 / 400      | Row text, secondary UI         |
| label | `0.75rem` / 1.4 / 500       | Chips, captions                |

`text-wrap: balance` on headings; `pretty` on prose. The root font-size itself is a user setting
(`useFontScale`, 87.5 – 125%), applied by a pre-paint inline script in `layout.tsx` alongside the
theme, so the app never flashes default → preferred.

## Radii, elevation, motion

- Radii: `--radius-sm 8px`, `--radius-md 12px`, `--radius-lg 16px`, pill `999px`.
- Elevation: two low-opacity shadows (`--shadow-1`, `--shadow-2`), **black in both themes** — a
  shadow is an absence of light rather than a colour, and a scrim under a light sheet is still
  black. Panels lean on border + surface step, not heavy drop shadows.
- Motion: `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` (expo-ish, no bounce); `--dur-fast 150ms`,
  `--dur 220ms`. Motion conveys state only (hover, focus, selection, value reveal). No page-load
  choreography. Every transition has a `prefers-reduced-motion: reduce` fallback.
- Z-scale (semantic, no magic numbers): `--z-header 100`, `--z-dropdown 200`, `--z-toast 300`.

## Components & states

Every interactive element ships default / hover / focus-visible / active / disabled, and every
touch target clears 44px (`.btn`, `.tap`). Shared classes live in `globals.css`:

- **Buttons** — `.btn` + `.btn-primary` (action fill: `--color-action` on `--color-on-action`) /
  `.btn-ghost` (transparent, `border-strong`); `active` presses down 1px.
- **`.panel`** — the surface card (surface + border + `radius-lg`); the app leans on border +
  surface step, not heavy shadows. Never nest panels.
- **`.chip`** — category pill in `surface-2` + `muted`. A **selected** chip (the keypad's
  date/currency/account row) flips to `--color-selected` **with a `--color-text` border** — the lift
  alone is not a signal. `HeaderFilterChip` is the same chip as a control, with a visible ×.
- **Category markers** — `CategoryIcon` (a coloured disc: a line-icon on a bold hue disc, or emoji
  on a 22% tint) and `CategoryGlyph` (disc-less, for places that already carry colour like the donut
  legend). A disc hue is stored as a **number, not a hex**, which is what keeps the glyph legible by
  construction; `discForeground()` flips it from white to near-black on the light end of the
  greyscale ramp. The icon set (emoji / Phosphor / Lucide) is a global setting.
- **Overlays** — native `<dialog>`: `.more-sheet` (bottom sheet, slides up), `.emoji-dialog` and
  `.confirm-dialog` (centred modals) get focus-trap, `Esc`, `::backdrop`, and top-layer stacking for
  free. `.menu` is the elevated combobox dropdown (records search) with a short rise-in.
- **Toasts** — `.toast-region` / `.toast`, the confirmation surface for a write (`withSaveToast`).
- **Bottom nav** — the active tab carries **three** signals (a `--color-selected` pill behind the
  icon, `--color-text` instead of `--color-muted`, and a heavier label) so the current section
  survives grayscale. The More tab carries a dot when a backup is overdue, with the signal also on
  the accessible name.
- **Empty state teaches** — no data explains how to add entries (the keypad, or restoring a Monefy
  CSV from Settings), it doesn't just say "no data".

## Layout

The whole app is a **centred fixed-width phone frame** — `.app-frame`, `max-width:
--app-max-width` (**412px**, tuned to a Samsung S24 Ultra), assembled in `shared/ui/AppShell.tsx`.
On a phone the frame is the viewport (edge-to-edge); on wider screens the body paints the dimmer
`--color-backdrop` behind it and the frame gains a hairline ring + shadow (`@media (min-width:
420px)`) so its edge reads. There is **no desktop layout** — desktop shows the same phone column,
centred.

The shell is a sticky blurred **header** (the `Wordmark` linking home, plus a slot the route fills
with the entries `SearchBox` — no top nav) over `<main>`, with a **fixed bottom tab bar**
(`BottomBar`): Home · Records · **⊕ FAB** (add expense, overhanging the bar) · Trends · More.
**More** opens a `.more-sheet` `<dialog>` launcher of eleven tiles in three captioned sections —
_Review_ (Year / Month / Report / Trips), then Budgets / Recurring, then Categories / Accounts /
Currency / Settings / About. Pages compose through `PageContainer` (a `gap-6` column with
mobile-first gutters).

Screens: **Home** — a `CycleSelector`, the total-spend panel, forward-looking cards (safe-to-spend,
left to spend today, upcoming bills), a chart/list toggle, and either the spending donut
(`DonutChart`) with a colour-keyed legend or a ranked `Breakdown`. The hole carries the transaction
count, set **below** the panel's total in both size and contrast: centre-of-ring is the loudest slot
on the page, and the count is the quietest figure on it — the ring annotates the answer, it doesn't
state it. **Records** — a `SearchBox` over day-grouped `SwipeRow`s (swipe to edit/delete, tap the
marker to recolour it). **Trends** — the over-time surface (6-cycle bars, this-vs-last delta,
by-category / by-account toggle); `/year`, `/month`, `/report` and `/trips` extend it.

Charts follow the "tested pure option-builder + thin React wrapper" split. ECharts draws to a
**canvas**, which bakes token values at render time — so an option-builder must take the resolved
theme as an explicit dependency (`useResolvedTheme`) or a theme switch leaves the old palette on
screen.
