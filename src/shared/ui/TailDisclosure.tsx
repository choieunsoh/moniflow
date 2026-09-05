import type { ReactNode } from 'react';

// The long quiet end of a ranked list, folded behind one tap.
//
// Native <details>: a disclosure is exactly what this is, and the element brings its own keyboard
// operability, AT semantics and open/close state for free — no hook, no client state, no JS.
//
// Why a disclosure rather than a cap: a ranked list beside a donut has to fold at the SAME point as
// the ring (see MAX_SLICES in entries/donut.ts) or the two views disagree about how many categories
// there were. The RING has no choice but to roll its tail into an inert "Other"; a list does — every
// row stays present, tappable, and findable by in-page search. Nothing is dropped, so no total above
// the list is ever left summing rows the reader cannot see.
//
// `singular`/`plural` are both props because the markup this replaces hardcoded
// "category"/"categories", which would have offered "12 more categories" the moment an account list
// reused it.
export function TailDisclosure({
  count,
  singular,
  plural,
  children,
}: {
  count: number;
  singular: string;
  plural: string;
  children: ReactNode;
}) {
  // Nothing to disclose renders nothing at all — a short list must not end on a dead control.
  if (count <= 0) return null;

  return (
    <details className="mt-3">
      <summary
        className="tap flex cursor-pointer items-center text-sm underline"
        style={{ color: 'var(--color-text)' }}
      >
        {count} more {count === 1 ? singular : plural}
      </summary>
      {children}
    </details>
  );
}
