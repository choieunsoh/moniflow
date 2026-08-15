import type { EntryRow } from './schema';

// "When in the week does the money go" — the active cycle's spend bucketed by day of week. The
// heatmap shows WHICH dates; this shows the WEEKLY RHYTHM (peak day, weekend vs weekday). Net
// (outflows stored negative, inflows positive; negating makes a refund subtract). Weekday comes from
// the UTC date key via Intl — the date keys are UTC-stable, so no timezone drift and no string
// slicing.
export type WeekdayRow = { day: string; total: number; count: number };
export type WeekdayStats = {
  rows: WeekdayRow[]; // always 7, Mon..Sun
  peak: WeekdayRow | null; // highest total; null when no spend
  // Per-slot average ratio: (weekend total / 2) / (weekday total / 5). > 1 = weekends spend heavier.
  // null when there is no weekday spend to divide by. ponytail: slot-count normalisation (2 vs 5),
  // not true per-day-occurrence average — a glance heuristic; upgrade to date-occurrence counting if
  // it ever misleads.
  weekendRatio: number | null;
  totalCount: number; // entry count, for the card to soften copy on a thin sample
};

const ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKEND = new Set(['Sat', 'Sun']);
const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

export function byWeekday(entries: EntryRow[]): WeekdayStats {
  const totals = new Map<string, { total: number; count: number }>();
  for (const day of ORDER) totals.set(day, { total: 0, count: 0 });

  for (const entry of entries) {
    const day = fmt.format(new Date(`${entry.date}T00:00:00Z`));
    const cell = totals.get(day);
    if (cell === undefined) continue; // defensive; Intl 'short' en-US yields exactly ORDER
    cell.total += -entry.amount;
    cell.count += 1;
  }

  const rows: WeekdayRow[] = ORDER.map((day) => {
    const cell = totals.get(day) ?? { total: 0, count: 0 };
    return { day, total: cell.total, count: cell.count };
  });

  const totalCount = rows.reduce((sum, r) => sum + r.count, 0);
  const peak =
    totalCount === 0 ? null : rows.reduce((best, r) => (r.total > best.total ? r : best), rows[0]);

  const weekdayTotal = rows.filter((r) => !WEEKEND.has(r.day)).reduce((s, r) => s + r.total, 0);
  const weekendTotal = rows.filter((r) => WEEKEND.has(r.day)).reduce((s, r) => s + r.total, 0);
  // ponytail: only the === 0 divide-by-zero is guarded, not a negative weekdayTotal (now reachable
  // since totals net refunds) — same unreachability class as this file's other ceilings: it needs
  // Mon–Fri refunds to outweigh Mon–Fri spend across an entire cycle. Upgrade to
  // Math.max(0, weekdayTotal) if a ratio ever prints inverted.
  const weekendRatio = weekdayTotal === 0 ? null : weekendTotal / 2 / (weekdayTotal / 5);

  return { rows, peak, weekendRatio, totalCount };
}
