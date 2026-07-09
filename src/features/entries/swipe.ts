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
