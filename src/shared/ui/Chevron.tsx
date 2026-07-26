// The app's prev/next arrowheads, shared by every stepper (cycle, year). aria-hidden: the arrow is
// decoration — the control around it carries the accessible name, which has to say WHERE it goes
// ("Previous cycle: 18 Jun – 17 Jul"), something a glyph can't.
export function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M10 3 5 8l5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 3l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
