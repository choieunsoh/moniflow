// One short pulse under a press, so the on-screen keypad answers a thumb the way keys do.
//
// Best-effort by design, and it must stay that way: the Vibration API is Android-only (iOS Safari
// has never shipped it), the browser may refuse it outright (no user activation yet, battery saver),
// and jsdom has no implementation at all. So this checks for the method rather than calling it
// through `?.` — `navigator.vibrate` is non-optional in lib.dom, so an optional call would read as
// dead code to a type-aware reader while being exactly the case that happens on iOS.
//
// No setting guards it: the OS already owns "should this phone buzz", and duplicating that switch in
// the app would only let the two disagree.
export function buzz(ms = 10): void {
  if ('vibrate' in navigator) navigator.vibrate(ms);
}
