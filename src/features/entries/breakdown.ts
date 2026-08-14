import type { Breakdown } from './queries';

export type Bar = Breakdown & { pct: number; share: number };

// Proportional bar widths for the dashboard breakdown list. pct is relative to the largest
// magnitude in the set, so the top row always fills the track. Pure — the UI just renders widths.
//
// `share` is a DIFFERENT number: the row's slice of the whole set, rounded the way the donut legend
// rounds it. The list used to print no percentage at all, so toggling chart→list silently dropped
// the share column and the user had to carry it across the toggle. The two are not interchangeable —
// given four equal rows every pct is 100 and every share is 25.
export function toBars(items: Breakdown[]): Bar[] {
  const net = items.map((i) => ({ item: i, value: Math.max(0, -i.total) }));
  const max = Math.max(0, ...net.map((n) => n.value));
  const sum = net.reduce((acc, n) => acc + n.value, 0);
  return net.map((n) => ({
    ...n.item,
    pct: max === 0 ? 0 : (n.value / max) * 100,
    share: sum === 0 ? 0 : Math.round((n.value / sum) * 100),
  }));
}
