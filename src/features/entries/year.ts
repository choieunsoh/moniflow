import type { EntryRow } from './schema';
import type { Cycle } from './cycle';
import { toTrendBars, completeBars, type TrendBar } from './trend';
import { topTransactions } from './top-transactions';
import { topNotes, type NoteRow } from './by-note';
import { byWeekday, type WeekdayStats } from './by-weekday';

export type YearCategory = { name: string; value: number; count: number };

// A trailing-12-cycle recap, folded from ONE getEntriesInRange over the window (the hook bounds the
// query to cycles[0].start..cycles[11].end, so every entry falls in some cycle). Pure — buckets each
// entry into its cycle by date range and reuses the shared trend/tx/note/weekday helpers, so the
// recap and the rest of the app agree by construction.
export type YearSummary = {
  total: number;
  bars: TrendBar[];
  categories: YearCategory[];
  // Over COMPLETE cycles only (not the live partial) — a mid-cycle month must not be crowned biggest.
  biggestMonth: { key: string; label: string; value: number } | null;
  biggestTransaction: EntryRow | null;
  topNotes: NoteRow[];
  weekday: WeekdayStats;
  // Mean over complete cycles that have spend; null when there are none (see completeBars).
  avgPerCycle: number | null;
  activeCycleCount: number;
};

export function yearSummary(entries: EntryRow[], cycles: Cycle[], currentKey: string): YearSummary {
  const perCycle = new Map<string, number>();
  for (const c of cycles) perCycle.set(c.key, 0);
  const perCategory = new Map<string, { value: number; count: number }>();

  for (const entry of entries) {
    const mag = Math.abs(entry.amount);
    const cycle = cycles.find((c) => entry.date >= c.start && entry.date <= c.end);
    if (cycle !== undefined) perCycle.set(cycle.key, (perCycle.get(cycle.key) ?? 0) + mag);
    const cat = perCategory.get(entry.category) ?? { value: 0, count: 0 };
    perCategory.set(entry.category, { value: cat.value + mag, count: cat.count + 1 });
  }

  const bars = toTrendBars(cycles, perCycle, currentKey);
  const total = [...perCycle.values()].reduce((sum, v) => sum + v, 0);

  const categories: YearCategory[] = [...perCategory.entries()]
    .map(([name, v]) => ({ name, value: v.value, count: v.count }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  const complete = completeBars(bars);
  const ranked = [...complete].sort((a, b) => b.value - a.value);
  const biggestMonth =
    ranked.length > 0
      ? { key: ranked[0].key, label: ranked[0].label, value: ranked[0].value }
      : null;
  const avgPerCycle =
    complete.length > 0 ? complete.reduce((sum, b) => sum + b.value, 0) / complete.length : null;

  return {
    total,
    bars,
    categories,
    biggestMonth,
    biggestTransaction: topTransactions(entries, 1)[0] ?? null,
    topNotes: topNotes(entries),
    weekday: byWeekday(entries),
    avgPerCycle,
    activeCycleCount: complete.length,
  };
}
