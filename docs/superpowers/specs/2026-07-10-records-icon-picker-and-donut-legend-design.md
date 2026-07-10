# Records icon picker + icon-set-aware donut legend — design

Date: 2026-07-10
Status: Approved (design), pending implementation plan

Two small, independent features for moniflow, both leaning on components that already exist.

---

## Feature 1 — Records: tap a category icon to change its icon + background

### Goal

On the `/records` page, tapping a row's category marker opens the same icon + background
picker used on the Categories page, so a category's look can be edited without leaving the
list you're reading.

### Current state

- `SwipeRow` (`src/features/entries/ui/SwipeRow.tsx`) renders a **static**
  `<CategoryIcon size="sm">` at the start of each row. It is display-only.
- The picker already exists: `EmojiPicker`
  (`src/features/categories/ui/EmojiPicker.tsx`) — a native `<dialog>` with an icon grid
  (`EMOJI_CHOICES`) and a hue-swatch row (`HUE_PRESETS` + an "Auto" reset). Its trigger is a
  `CategoryIcon` at `size="md"` (40px).
- Its server actions (`setCategoryEmojiAction`, `setCategoryHueAction`, in
  `src/features/categories/actions.ts`) already call `revalidatePath('/', 'layout')`, so a
  pick re-renders records, the home legend, and the categories list at once.
- `SwipeRow` already receives everything the picker needs: `emoji`, `iconSet`, `hue`, and
  `entry.category`.

### Design

Replace the static `<CategoryIcon>` in `SwipeRow` with:

```tsx
<span onPointerDown={stopDrag}>
  <EmojiPicker
    category={entry.category}
    current={emoji}
    iconSet={iconSet}
    currentHue={hue}
  />
</span>
```

- The picker trigger is already `md` (40px), matching the chosen "enlarge marker to 40px"
  option. No size prop change is needed.
- **Gesture handling:** the `<span onPointerDown={stopDrag}>` wrapper reuses `SwipeRow`'s
  existing `stopDrag = (e) => e.stopPropagation()` — the identical guard the filter chips
  already use. This stops a press on the icon from starting a row swipe; the icon tap opens
  the dialog, while swipe-to-edit/delete still works from the rest of the row and the chips
  still filter.
- Native `<dialog>.showModal()` renders in the top layer, so the dialog escapes the row's
  `overflow-hidden` / the `.panel` clip without any portal.
- No changes to `records/page.tsx` — the required data already flows into `SwipeRow`.

### Trade-off (accepted)

A records page can list dozens of rows, so dozens of `EmojiPicker` instances (each a hidden
`<dialog>`) mount at once. These are cheap and inert until opened — acceptable for a
single-user local app. Not worth a shared-single-dialog abstraction now.

### Files

- **Edit** `src/features/entries/ui/SwipeRow.tsx` — import `EmojiPicker`, replace the static
  `CategoryIcon` with the wrapped `EmojiPicker`, drop the now-unused `CategoryIcon` import if
  nothing else uses it.

---

## Feature 2 — Home: donut legend respects the icon-set setting

### Goal

On `/` (home), the chart-view donut legend must render category icons in the user's selected
icon set (emoji / Phosphor / Lucide), matching the rest of the app. Today it always shows the
raw emoji glyph regardless of the setting.

### Current state

- `src/app/page.tsx` donut-view legend (~lines 73–94) renders the marker as a raw glyph:
  `{emojiFor(emojiMap, s.name)}`. It ignores `iconSet`.
- The **List** view on the same page already renders icons correctly via `Breakdown` →
  `CategoryIcon` with `iconSet`. So only the donut legend is affected.
- The legend's small colored dot is the **donut slice color** (`SLICE_COLORS` /
  `OTHER_COLOR` in `src/features/entries/donut.ts`), a fixed 7-color categorical palette.
  This is **not** the same as a category's hue disc (`categoryColorBold`). The dot is what
  maps a legend row to its ring slice, so it must be preserved.

### Design

Add a small presentational component and use it in the legend.

`src/features/categories/ui/CategoryGlyph.tsx` — a **disc-less**, set-aware marker:

```tsx
export function CategoryGlyph({
  emoji,
  iconSet = 'emoji',
  size = 16,
}: {
  emoji: string;
  iconSet?: IconSet;
  size?: number;
}) {
  const Icon = iconMapFor(iconSet)?.[emoji];
  return Icon ? (
    <Icon size={size} />
  ) : (
    <span className="leading-none">{emoji}</span>
  );
}
```

- It reuses `iconMapFor(iconSet)?.[emoji]` — the same lookup `CategoryIcon` uses — but omits
  the colored disc, because the legend already carries the slice-color dot.
- Library icons render monochrome via `currentColor` (default `<Icon>` color), inheriting the
  legend row's text color. Emoji sets render the glyph unchanged.
- An unmapped emoji (e.g. the synthetic `"Other"` bucket, which has no icon-map entry) falls
  through to the emoji glyph — same graceful degrade as `CategoryIcon`.

In `page.tsx`, replace the raw emoji `<span>` in the legend with:

```tsx
<span aria-hidden className="shrink-0">
  <CategoryGlyph emoji={emojiFor(emojiMap, s.name)} iconSet={iconSet} />
</span>
```

`iconSet` is already computed in `page.tsx`. The slice-color dot line is unchanged.

### Files

- **Add** `src/features/categories/ui/CategoryGlyph.tsx`
- **Add** `src/features/categories/ui/CategoryGlyph.test.tsx` (see Testing)
- **Edit** `src/app/page.tsx` — import and use `CategoryGlyph` in the donut legend

---

## Testing

- **`CategoryGlyph`** — RTL test (`jsdom`, already configured):
  - Under a non-emoji set (e.g. `lucide`) with an emoji that the map covers, it renders the
    library icon (an `<svg>`), not the emoji text.
  - Under the `emoji` set (or an unmapped emoji), it renders the emoji text.
- **Feature 1** — verified in the browser (Playwright) rather than a brittle gesture unit
  test: tapping a records row's icon opens the picker dialog; swiping the row still reveals
  edit/delete; picking an icon/color updates the row (and persists via revalidation). The pure
  swipe math is already covered by `swipe.test.ts`.

All standard gates before each commit: `format:files` on touched files, `typecheck`, `lint`,
`format:check`, `npm test`.

## Commits

1. `feat(features): edit a category's icon + background from the records list`
2. `fix(features): render home donut legend icons in the selected icon set`
