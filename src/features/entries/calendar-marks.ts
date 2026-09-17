import type { EntryRow } from './schema';
import type { Cycle } from './cycle';
import { eachDay } from './heatmap';
import { isFixed, isOffBudget } from './off-budget';

// Which kinds of money moved on a day, for the Records calendar's glyph marks. Colour is not used:
// hue already means category, the accent means action, and cell darkness means discretionary spend.
export type DayMarks = { posted: boolean; upcoming: boolean; offBudget: boolean; refund: boolean };

const NONE: DayMarks = { posted: false, upcoming: false, offBudget: false, refund: false };

// Marks per day, keyed 'YYYY-MM-DD'; a day with no mark is absent. Each row earns ONE mark, checked
// refund first (a positive amount is money handed back, whatever its category), then off-budget, then
// fixed: the same off-budget-before-fixed precedence as splitBudgetSpend. A refund leaves darkness
// alone: it already nets against the day in discretionaryByDate, so a refund-only day is otherwise
// indistinguishable from a quiet one. `upcomingDates` are the not-yet-posted rule dates the caller got
// from postsBetween — passed in as plain dates so this module never needs the recurring rule shape.
export function dayMarks(
  entries: EntryRow[],
  upcomingDates: readonly string[],
  offBudgetCategories: Set<string>,
  travelCurrencies: Set<string>,
): Map<string, DayMarks> {
  const out = new Map<string, DayMarks>();
  const mark = (date: string, patch: Partial<DayMarks>) =>
    out.set(date, { ...(out.get(date) ?? NONE), ...patch });
  for (const e of entries) {
    if (e.amount > 0) mark(e.date, { refund: true });
    else if (isOffBudget(e, offBudgetCategories, travelCurrencies))
      mark(e.date, { offBudget: true });
    else if (isFixed(e)) mark(e.date, { posted: true });
  }
  for (const date of upcomingDates) mark(date, { upcoming: true });
  return out;
}

// The day the calendar opens on. A ?day= is honoured only if it is a real day of this cycle — checked
// against the cycle's own day list, so '2026-06-31' or a stale day from another cycle cannot select a
// cell that doesn't exist. Otherwise today when it falls in the cycle, else the cycle's last day.
export function resolveSelectedDay(
  dayParam: string | undefined,
  cycle: Cycle,
  today: string,
): string {
  const days = eachDay(cycle.start, cycle.end);
  if (dayParam !== undefined && days.includes(dayParam)) return dayParam;
  return days.includes(today) ? today : cycle.end;
}
