// Pure decisions behind this feature's two horizontal gestures. Both live here so there is one place
// to look for "how does a swipe decide"; they are otherwise unrelated — the first reveals a row's
// actions (Records), the second navigates a page (Home, /year, /month).

// ── swipe-to-reveal (Records rows) ────────────────────────────────────────────────────────────
// Snap decision for a swipe-to-reveal row. Given the row's current horizontal offset in px
// (negative = swiped left, positive = swiped right) and the action-panel width, decide which side
// should rest open once the finger lifts:
//   -1 → delete panel (right side) open   ·   0 → closed   ·   1 → edit panel (left side) open
// A swipe only commits once it passes `threshold` (half the panel by default); otherwise it snaps back.
export type SwipeSide = -1 | 0 | 1;

export function resolveSwipe(
  offset: number,
  actionWidth: number,
  threshold = actionWidth / 2,
): SwipeSide {
  if (offset <= -threshold) return -1;
  if (offset >= threshold) return 1;
  return 0;
}

// ── swipe-to-navigate (SwipeNav: Home, /year, /month) ─────────────────────────────────────────
// The DOM plumbing (pointer capture, click suppression) is verified in a real browser — jsdom has
// no pointer capture, so a unit test of the handlers would pass while proving nothing. These two
// decisions are the part worth pinning down here.

// A press has to travel before it counts as a drag. Below this it is a TAP and must reach whatever
// sits underneath. SwipeNav used to refuse to start on any link or button for exactly this reason,
// which left the rows a thumb actually lands on un-swipeable — /month's category and year lists are
// almost entirely links.
export const DRAG_START = 5;

// And it has to travel this far before it commits. Short of it, the content springs back.
export const COMMIT = 44;

// Horizontal intent only: `touch-action: pan-y` hands vertical panning to the browser, but a mouse
// drag gets no such help, so a mostly-vertical movement must not steal the gesture. Ties go to
// vertical — a diagonal that cannot make up its mind is far likelier to be a scroll than a swipe.
export function beginsDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) >= DRAG_START && Math.abs(dx) > Math.abs(dy);
}

// Where a finished drag lands, or null to spring back. A closed direction (null href) springs back
// too, so the gesture can never reach somewhere the stepper's arrow says is unreachable.
export function commitHref(
  dx: number,
  prevHref: string | null,
  nextHref: string | null,
): string | null {
  if (dx <= -COMMIT) return nextHref; // dragged left → forward
  if (dx >= COMMIT) return prevHref; // dragged right → back
  return null;
}
