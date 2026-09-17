import type { Cycle } from './cycle';

export type HeatmapCell = { date: string; total: number; intensity: number };

const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' });

// Every YYYY-MM-DD from start through end inclusive. Exported: dayPace walks the same cycle days. UTC arithmetic — the date keys are UTC (see the
// project's date policy), so stepping a UTC day count never trips DST.
export function eachDay(start: string, end: string): string[] {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const out: string[] = [];
  for (let t = Date.UTC(sy, sm - 1, sd); t <= Date.UTC(ey, em - 1, ed); t += 24 * 60 * 60 * 1000) {
    out.push(dateKey.format(new Date(t)));
  }
  return out;
}

// One cell per day of the cycle — a calendar-grid glance at where a cycle's spending landed. Days
// with no entries are real zeros (kept, not skipped: a gap in the grid would read as a bug).
// `totals` is spend per day, positive = spend — discretionaryByDate's shape, so a posted bill or an
// off-budget purchase never darkens a day (a ฿20k rent day would otherwise pin the max and flatten
// every other day to intensity 1). A day whose refunds outweigh its spend is negative and clamps
// to 0. `intensity` buckets 1..4 against the cycle's busiest day (0 for an empty day), so the render
// maps it to a background without knowing any baht figure.
export function toHeatmapCells(totals: ReadonlyMap<string, number>, cycle: Cycle): HeatmapCell[] {
  const dates = eachDay(cycle.start, cycle.end);
  const spendOn = (date: string) => Math.max(0, totals.get(date) ?? 0);
  const max = Math.max(0, ...dates.map(spendOn));
  return dates.map((date) => {
    const total = spendOn(date);
    const intensity = max === 0 || total === 0 ? 0 : Math.min(4, Math.ceil((total / max) * 4));
    return { date, total, intensity };
  });
}

// Pad the cycle's day cells into whole Sunday-started weeks so each day sits under its real weekday
// column: `null`s before the first day (its weekday index, Sun=0) and after the last day complete the
// grid. A null renders as a blank calendar square. Empty input → empty (the caller shows nothing).
// The cycle is a billing cycle, not a calendar month, so the days flow continuously across the month
// boundary (…31, 1…) in one grid rather than splitting into named months.
// ponytail: Sunday-start is hard-wired via getUTCDay(); a Monday-start would shift the lead by
// `(weekday + 6) % 7` and reorder the header labels — one place each.
export function toCalendarLayout(cells: HeatmapCell[]): (HeatmapCell | null)[] {
  if (cells.length === 0) return [];
  const [y, m, d] = cells[0].date.split('-').map(Number);
  const lead = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const out: (HeatmapCell | null)[] = [];
  for (let i = 0; i < lead; i++) out.push(null);
  for (const c of cells) out.push(c);
  while (out.length % 7 !== 0) out.push(null);
  return out;
}
