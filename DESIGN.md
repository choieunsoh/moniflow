# Design

Visual system for moniflow — a calm, trustworthy, local-first money-flow dashboard. Dark-first,
with an opinionated-but-swappable purple identity: every color is a token, and `--color-accent`
is the single anchor a scaffolded project changes to reskin the whole app.

## Theme

Dark by default (`#101114` canvas). The mood is a quiet financial workspace at night: low
ambient light, steady focus, nothing shouting. Color strategy is **Restrained** (product floor):
tinted-neutral surfaces carry the UI; the purple accent appears only on primary actions, the
current selection, and state — never as decoration. Light theme is not shipped, but the token
structure makes it a drop-in override (`:root[data-theme="light"]`) later.

## Color palette (OKLCH-reasoned, shipped as hex tokens in `globals.css @theme`)

| Token                   | Value                   | Role                                                     |
| ----------------------- | ----------------------- | -------------------------------------------------------- |
| `--color-backdrop`      | `#050506`               | Behind the phone frame on wide viewports (dimmer)        |
| `--color-bg`            | `#101114`               | Canvas (the app frame)                                   |
| `--color-surface`       | `#16181d`               | Panels, cards, table                                     |
| `--color-surface-2`     | `#1e2128`               | Raised: header, table head, hover, selected              |
| `--color-border`        | `#2a2d38`               | Hairlines, dividers, panel edges                         |
| `--color-border-strong` | `#3a3e4c`               | Emphasized dividers, input borders                       |
| `--color-text`          | `#ecedf1`               | Primary ink (14.9:1 on bg)                               |
| `--color-muted`         | `#9da1b3`               | Secondary text (5.9:1 on bg — clears AA)                 |
| `--color-faint`         | `#7a7e8f`               | Tertiary/labels — large or non-essential only            |
| `--color-accent`        | `#7132f5`               | **Swappable anchor.** Primary action, active, focus fill |
| `--color-accent-hover`  | `#5741d8`               | Action hover                                             |
| `--color-accent-text`   | `#9b7bff`               | Accent used AS text (6.0:1 on bg — AA)                   |
| `--color-accent-soft`   | `rgba(113,50,245,0.16)` | Selected row, active chip, focus glow                    |
| `--color-on-accent`     | `#ffffff`               | Text on accent fills (6.04:1)                            |
| `--color-gain`          | `#19c37d`               | Inflow / positive                                        |
| `--color-loss`          | `#f0616d`               | Outflow / negative                                       |
| `--color-warn`          | `#f5a524`               | Caution                                                  |

**Contrast is verified, not assumed.** Body ≥4.5:1, large ≥3:1. Gain/loss is never color-only —
always paired with a `+`/`−` sign so it survives grayscale and color blindness.

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

`text-wrap: balance` on headings; `pretty` on prose.

## Radii, elevation, motion

- Radii: `--radius-sm 8px`, `--radius-md 12px`, `--radius-lg 16px`, pill `999px`.
- Elevation: two low-opacity shadows tuned for dark (`--shadow-1`, `--shadow-2`); panels lean on
  border + surface step, not heavy drop shadows.
- Motion: `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` (expo-ish, no bounce); `--dur-fast 150ms`,
  `--dur 220ms`. Motion conveys state only (hover, focus, selection, value reveal). No page-load
  choreography. Every transition has a `prefers-reduced-motion: reduce` fallback.
- Z-scale (semantic, no magic numbers): `--z-header 100`, `--z-dropdown 200`, `--z-toast 300`.

## Components & states

Every interactive element ships default / hover / focus-visible / active / disabled, and every
touch target clears 44px (`.btn`, `.tap`). Shared classes live in `globals.css`:

- **Buttons** — `.btn` + `.btn-primary` (accent fill) / `.btn-ghost` (transparent, border on hover);
  `active` presses down 1px.
- **`.panel`** — the surface card (surface + border + `radius-lg`); the app leans on border +
  surface step, not heavy shadows. Never nest panels.
- **`.chip`** — category pill in `surface-2`; the active filter chip flips to `accent-soft` +
  `accent-text`.
- **Category markers** — `CategoryIcon` (a coloured disc: white line-icon on a bold hue disc, or
  emoji on a soft tint) and `CategoryGlyph` (disc-less, for places that already carry colour like
  the donut legend). The icon set (emoji / Phosphor / Lucide) is a global setting.
- **Overlays** — native `<dialog>`: `.more-sheet` (bottom sheet, slides up) and `.emoji-dialog`
  (centred modal for the icon/colour picker) get focus-trap, `Esc`, `::backdrop`, and top-layer
  stacking for free. `.menu` is the elevated combobox dropdown (records search) with a short rise-in.
- **Bottom nav** — the active tab carries **three** signals (an `accent-soft` pill behind the icon,
  `accent-text` colour, and a heavier label) so the current section survives grayscale.
- **Empty state teaches** — no data explains how to add entries (the keypad or the CLI `seed`
  command), it doesn't just say "no data".

## Layout

The whole app is a **centred fixed-width phone frame** — `.app-frame`, `max-width:
--app-max-width` (**412px**, tuned to a Samsung S24 Ultra). On a phone the frame is the viewport
(edge-to-edge); on wider screens the body paints the dimmer `--color-backdrop` behind it and the
frame gains a hairline ring + shadow (`@media (min-width: 420px)`) so its edge reads. There is **no
desktop layout** — desktop shows the same phone column, centred.

The shell is a sticky blurred **header** (just the `Wordmark`, linking home — no top nav) over
`<main>`, with a **fixed bottom tab bar** (`BottomBar`): Home · Records · **⊕ FAB** (add expense,
overhanging the bar) · Budgets · More. **More** opens a `.more-sheet` `<dialog>` launcher
(Categories / Trips / Settings). Pages compose through `PageContainer` (a `gap-6` column with
mobile-first gutters).

Screens: **Home** — a `CycleSelector`, a chart/list toggle, and either the spending donut
(`DonutChart`, total in the hole) with a colour-keyed legend or a ranked `Breakdown`. **Records** —
a `SearchBox` over day-grouped `SwipeRow`s (swipe to edit/delete, tap the marker to recolour it).
Charts follow the "tested pure option-builder + thin React wrapper" split.
