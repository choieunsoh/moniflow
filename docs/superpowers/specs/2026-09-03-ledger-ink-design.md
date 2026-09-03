# Ledger ink: give the palette a derivation and the accent one meaning

Date: 2026-09-03
Branch: `feat/ledger-ink`
Status: approved, ready for planning
Slice: B of four, from the prom-design review of all 16 mobile routes

## Why

The review found the palette is the category reflex: a `#101114` cool grey ground that comes from
nowhere in particular, and a `#7132f5` violet accent, which together are what every AI-built finance
app looks like. The house rule is that a ground's tint comes from the subject's material world and an
accent comes from an object the business actually owns. Neither of ours does.

Worse than the colours themselves is that the accent means six things at once: the FAB (an action),
the active tab (a location), the active toggle (a selection), every link, the keypad's arithmetic
operators, and all six Save buttons in Settings. A colour that means six things means nothing.

Red has the mirror problem. Every amount in `/records` and `/recurring` is red, but every row there
is an expense, so the list is uniformly red and the exception (a refund) is green. Red is the default
and therefore carries no information.

And the borders measure **1.29:1** against surface, which is not a hairline, it is nothing.

**Dark mode is not the defect and is not changing.** The user prefers dark. What changes is that the
darkness acquires a derivation.

## Constraint discovered while designing this

The hue wheel is already crowded. Measured in OKLCH, the seven category colours plus gain and loss
occupy: 18 (loss), 48, 72, 126, 158 (gain), 198, 226, 250, 289 (current accent), 338 degrees. The
only gaps wider than 40 degrees are 72 to 126 (chartreuse) and 289 to 338 (magenta), and neither is
a defensible accent for a money app.

So "pick a nicer accent hue" is mostly unavailable without also re-deriving the seven category
colours, which `donut.ts` selected deliberately to sit at least 38 degrees off the accent and 26 off
gain and loss. That constraint is what makes the structural answer better than a recolour.

## Decisions taken

Both were the user's, recorded so they are not re-litigated.

- **Direction: Ledger ink.** A cool blue-black ground, the colour of ink on a bank statement. The
  primary action carries NO hue: it is the maximum-contrast object on the page. This is the
  alternative grammar prom-design documents for the instrument register, and taking it frees the
  entire hue budget for category identity, which is the one place hue carries real data.
- **Borders: two steps by role**, using the ramp the repo already has rather than one value
  everywhere. A blanket 3:1 border was measured at `#5B6684` and outlines every card, which reads
  busier than what exists today. A quiet edge is right for a panel already delimited by its own
  surface lightness; a stronger edge is right for a boundary that means "tap here".

## The token contract

```
--color-bg              #0C0F16   cool blue-black ground
--color-surface         #141926   raised
--color-surface-2       #1D2333   raised further
--color-border          #4A5470   2.33:1 on surface, card and panel edges
--color-border-strong   #5B6684   3.07:1 on surface, inputs, keys, dividers, chrome
--color-text            #E7EBF4   16.05:1 on bg
--color-muted           #98A1BA    6.80:1 on surface
--color-faint           #868FA8   4.86:1 on surface-2, 5.44:1 on surface, 5.94:1 on bg
--color-action          #F2F5FC   the one next action per screen, no hue
--color-on-action       #0C0F16   17.56:1 on action
--color-selected        rgba(231,235,244,0.10)  the "where you are" chip
--color-focus-ring      #F2F5FC   keyboard focus, keeps the existing 2px offset
```

Unchanged: `--color-gain`, `--color-loss`, `--color-warn`, the seven `SLICE_COLORS`, radii, spacing,
motion, z-scale, and the whole type system. This slice touches colour and nothing else.

### Tokens removed

`--color-accent`, `--color-accent-hover`, `--color-accent-text`, `--color-accent-soft`,
`--color-accent-ring`. Every consumer is retargeted per the grammar below.

### The token that must NOT be removed, despite its name

**`--color-on-accent` has nothing to do with the accent.** It is consumed by
`DeleteAccountButton`, `DeleteCategoryButton`, `AccountMergeButton`, `Breakdown` and `LegendRow` as
the ink drawn on top of a saturated fill: a category disc, an account icon, a destructive button.
Deleting it alongside the accent would break five components whose colour has no relationship to the
accent at all.

It is renamed `--color-on-fill` to stop the name lying, and its value stays `#ffffff`. This is the
one place in the app where a pure white is correct: it is ink on a saturated coloured disc, not a
surface.

## The grammar

Three treatments, three meanings, no overlap. This is the whole point of the slice: the previous
failure was not the hue, it was that one treatment carried six meanings.

| Treatment | Means | Applies to |
|---|---|---|
| Near-white fill (`--color-action`) | the one next action on this screen | the FAB, `.btn-primary` |
| Near-white text plus an arrow or underline | this text is tappable | "See all", "Back up now", "n categories in Other", "Collapse all" |
| Lighter ground chip (`--color-selected`) | where you are | active tab pill, active view toggle |

Everything else that currently reads accent loses it. The keypad's arithmetic operators become
neutral. Settings' six Save buttons become secondary (`.btn-ghost`), because six near-white fills on
one screen would break the one-action invariant outright; the buttons all still exist and still save,
since removing five of them by moving Settings to save-on-change is slice C's business, not this
one's.

**One primary action per screen** is the invariant. If a screen appears to need two near-white fills,
that is a finding to report, not a thing to render.

## Red earns its meaning back

Red becomes reserved for **over-budget and destructive or error states only**.

- Amounts in `/records` and `/recurring` render in `--color-text`. Every row there is an expense, so
  red on all of them was information-free.
- Gain-green stays on refunds. A refund is a genuine exception, and it already carries an explicit
  `+` prefix, so the signal is not colour-alone.
- The Danger zone, delete confirmations and the over-budget meter state keep red. They are the
  meanings red is being reserved for.

## Testing

Colour tokens look untestable and are not. Two properties are machine-checkable and both have
precedent in this repo: `donut.test.ts` already computes OKLCH hue distance to stop a category colour
impersonating the accent.

A new test parses `globals.css` and asserts, from the actual token values rather than from a
duplicated copy of them:

1. **Contrast floors.** `--color-text` and `--color-muted` clear 4.5:1 on the surfaces they are used
   on; `--color-faint` clears 4.5:1 on `--color-surface-2`; `--color-on-action` clears 4.5:1 on
   `--color-action`; `--color-action` and `--color-border-strong` clear 3:1 where a non-text boundary
   needs it; `--color-focus-ring` clears 3:1 per WCAG 2.2 SC 1.4.11.
2. **Hue separation.** No `SLICE_COLORS` entry sits within 25 degrees of gain or loss. The existing
   accent-impersonation test is retired with the accent it guarded, and its intent is preserved by
   the gain/loss checks that remain.

The test must fail if a token is edited below its floor. That is verified by mutating a token in a
scratch worktree and confirming red, not by assuming.

Tests are necessary and not sufficient: a palette is a thing you look at. The slice is not done until
it has been driven at 390px on the real ledger.

## Scope

Four tasks:

1. Token contract plus the contrast and hue test.
2. Retarget the 94 accent references into the three treatments.
3. Retarget the 29 loss and gain references so red means over-budget and error only.
4. Browser pass at 390px, consumer sweep, screenshot comparison against slice A's baseline.

Out of scope, each its own later slice: density (C), layout, truncation and the dash sweep (D).
No schema change, no OPFS migration, no backup-format change, no new dependency, no type or spacing
change.

## Done means

- No `--color-accent*` token remains, and no component references one.
- Exactly one near-white fill per screen, verified by looking at every route.
- No amount renders red unless it is over budget.
- Borders are visible: 2.33:1 on panels, 3.07:1 on interactive edges, measured from the rendered
  pixels rather than from the token values.
- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` all pass, run separately.
- Driven at 390px against the real ledger, with before and after screenshots of Home, `/records`,
  `/budgets` and the keypad.

## Risks

- **The chrome goes monochrome.** This is the boldest part and the user will feel it immediately. The
  bet is that in an instrument the data should be the colourful thing and the chrome should not
  compete. If it reads as drab in the browser, the fallback is to reintroduce a single restrained hue
  for tappable text only, which is one token and does not disturb the rest of the grammar.
- **Links losing colour can cost discoverability**, which the review's own Law 4 warns about. This is
  why tappable text keeps an arrow or an underline rather than relying on weight alone.
- **A near-white FAB is a large bright object** on a dark screen and sits near the thumb at all times.
  If it reads as glaring, the mitigation is to reduce its size or drop it to `--color-text` rather
  than to reintroduce a hue.
- **94 references is a wide sweep**, and the review that produced this document found that the last
  wide sweep on this repo swept producers thoroughly and consumers selectively. Every route gets
  opened in the browser before this is called done, not just the ones a task touched.
