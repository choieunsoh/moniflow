import type { Breakdown } from './queries';

export type Bar = Breakdown & { pct: number };

// Proportional bar widths for the dashboard breakdown list. pct is relative to the largest
// magnitude in the set, so the top row always fills the track. Pure — the UI just renders widths.
export function toBars(items: Breakdown[]): Bar[] {
  const max = Math.max(0, ...items.map((i) => Math.abs(i.total)));
  return items.map((i) => ({ ...i, pct: max === 0 ? 0 : (Math.abs(i.total) / max) * 100 }));
}
