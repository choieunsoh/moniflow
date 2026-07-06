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
| `--color-bg`            | `#101114`               | Canvas                                                   |
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

Two IBM Plex families on a real contrast axis: **Sans** for all UI/prose, **Mono** for every
number (amounts, dates, counts) — data honesty made visible. Self-hosted via `next/font`.

Fixed rem scale (product register — no fluid clamp in the app; the one exception is the home
hero, a deliberate brand moment, capped at 3rem):

| Step  | Size / line-height / weight              | Use                     |
| ----- | ---------------------------------------- | ----------------------- |
| hero  | `clamp(2.25rem, 5vw, 3rem)` / 1.05 / 600 | Home hero only          |
| h1    | `2rem` / 1.15 / 600                      | Page title              |
| h2    | `1.5rem` / 1.2 / 600                     | Section                 |
| h3    | `1.25rem` / 1.3 / 600                    | Panel title             |
| body  | `1rem` / 1.6 / 400                       | Prose (cap 68ch)        |
| small | `0.875rem` / 1.5 / 400                   | Secondary UI            |
| label | `0.75rem` / 1.4 / 500                    | Captions, table headers |

`text-wrap: balance` on headings; `pretty` on prose. Numerals use `font-variant-numeric:
tabular-nums` so columns align.

## Radii, elevation, motion

- Radii: `--radius-sm 8px`, `--radius-md 12px`, `--radius-lg 16px`, pill `999px`.
- Elevation: two low-opacity shadows tuned for dark (`--shadow-1`, `--shadow-2`); panels lean on
  border + surface step, not heavy drop shadows.
- Motion: `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` (expo-ish, no bounce); `--dur-fast 150ms`,
  `--dur 220ms`. Motion conveys state only (hover, focus, selection, value reveal). No page-load
  choreography. Every transition has a `prefers-reduced-motion: reduce` fallback.
- Z-scale (semantic, no magic numbers): `--z-header 100`, `--z-dropdown 200`, `--z-toast 300`.

## Components & states

Every interactive element ships default / hover / focus-visible / active / disabled. Buttons:
`primary` (accent fill), `ghost` (transparent, border on hover). Nav links carry an `active`
state (accent-text + underline). Category chips are pills in `surface-2`. Tables: `surface`
body, `surface-2` sticky header, row hover in `surface-2`, selected in `accent-soft`.

- **Loading**: skeleton blocks in `surface-2`, never a centered spinner.
- **Empty state teaches**: the dashboard with no data explains how to add entries (the CLI seed
  command), it doesn't just say "no data".

## Layout

App shell: sticky header (wordmark + nav + action), content in a centered container
(`max-width: 1120px` for the dashboard, `68ch` for prose). Dashboard stacks: a quiet summary bar
(net / in / out / count — a flex row, **not** a hero-metric block), a flow-over-time chart panel,
then the recent-entries ledger. Responsive is structural: header condenses, the ledger table
scrolls horizontally within its panel on narrow viewports.
