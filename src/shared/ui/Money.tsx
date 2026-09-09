import type { ReactNode } from 'react';

/**
 * The one span every rendered figure passes through, so privacy mode has a single selector to blur.
 *
 * It carries no styling of its own and takes no props beyond children: the element around it
 * already owns the typography, and a variant prop here would be a second place to decide how money
 * looks. Which formatter produced the string is still the caller's decision — provenance picks the
 * formatter (see money.ts), this only marks the result as a figure.
 *
 * money.test.ts scans every .tsx for a figure rendered without this wrapper, because nothing in the
 * type system can tell a wrapped figure from a bare string.
 */
export function Money({ children }: { children: ReactNode }) {
  return <span className="money">{children}</span>;
}
