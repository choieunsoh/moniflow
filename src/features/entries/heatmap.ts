import type { DayGroup } from './by-date';
import type { Cycle } from './cycle';

export type HeatmapCell = { date: string; total: number; intensity: number };

const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' });

// Every YYYY-MM-DD from start through end inclusive. UTC arithmetic — the date keys are UTC (see the
// project's date policy), so stepping a UTC day count never trips DST.
function eachDay(start: string, end: string): string[] {
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
// `intensity` buckets 1..4 against the cycle's busiest day (0 for an empty day), so the render maps
// it to a background token without knowing any baht figure.
export function toHeatmapCells(dayGroups: DayGroup[], cycle: Cycle): HeatmapCell[] {
  const totalByDate = new Map(dayGroups.map((g) => [g.date, Math.abs(g.total)]));
  const dates = eachDay(cycle.start, cycle.end);
  const max = Math.max(0, ...dates.map((d) => totalByDate.get(d) ?? 0));
  return dates.map((date) => {
    const total = totalByDate.get(date) ?? 0;
    const intensity = max === 0 || total === 0 ? 0 : Math.min(4, Math.ceil((total / max) * 4));
    return { date, total, intensity };
  });
}
