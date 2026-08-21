// Billing-cycle math for the money-flow dashboard. Pure, no DB. The user's credit card cuts off
// on the 18th, so a "cycle" runs the 18th → the 17th of the next month and is anchored (keyed) to
// its START month. One global cutoff for now; per-card cutoffs are a later slice.
import { toThreeLetterMonth } from '@shared/date';

export const CUTOFF = 18;

export type Cycle = { key: string; start: string; end: string; label: string };

const dmFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const isoUtc = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' });

function dm(d: Date): string {
  return toThreeLetterMonth(dmFmt.format(d));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatRange(start: Date, end: Date): string {
  const sy = start.getUTCFullYear();
  const ey = end.getUTCFullYear();
  const startStr = sy === ey ? dm(start) : `${dm(start)} ${sy}`;
  return `${startStr} – ${dm(end)} ${ey}`;
}

// startY/startM (1-based month) → the full cycle beginning on the cutoff of that month.
function buildCycle(startY: number, startM: number, cutoff: number): Cycle {
  const startDate = new Date(Date.UTC(startY, startM - 1, cutoff));
  const endDate = new Date(Date.UTC(startY, startM, cutoff - 1)); // next month, 17th; rolls year
  return {
    key: `${startY}-${pad2(startM)}`,
    start: isoUtc.format(startDate),
    end: isoUtc.format(endDate),
    label: formatRange(startDate, endDate),
  };
}

export function cycleOf(iso: string, cutoff = CUTOFF): Cycle {
  const [y, m, d] = iso.split('-').map(Number);
  if (d >= cutoff) {
    return buildCycle(y, m, cutoff);
  }
  const [py, pm] = stepYM(y, m, -1);
  return buildCycle(py, pm, cutoff);
}

export function cycleFromKey(key: string, cutoff = CUTOFF): Cycle {
  const [y, m] = key.split('-').map(Number);
  return buildCycle(y, m, cutoff);
}

export function currentCycleKey(todayIso: string, cutoff = CUTOFF): string {
  return cycleOf(todayIso, cutoff).key;
}

export function stepKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const [ny, nm] = stepYM(y, m, delta);
  return `${ny}-${pad2(nm)}`;
}

// (year, 1-based month) shifted by delta months, normalized. Returned as a tuple for buildCycle.
function stepYM(y: number, m: number, delta: number): [number, number] {
  const total = y * 12 + (m - 1) + delta;
  return [Math.floor(total / 12), (total % 12) + 1];
}

export type Progress = { day: number; total: number };

const DAY_MS = 86_400_000;

function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(`${bIso}T00:00:00Z`) - Date.parse(`${aIso}T00:00:00Z`)) / DAY_MS);
}

// 1-based day of `todayIso` within the cycle, and the cycle's length in days. Clamped so an
// out-of-range date (viewing a past/future cycle) still renders a sane meter.
export function cycleProgress(cycle: Cycle, todayIso: string): Progress {
  const total = daysBetween(cycle.start, cycle.end) + 1;
  const raw = daysBetween(cycle.start, todayIso) + 1;
  return { day: Math.min(total, Math.max(1, raw)), total };
}

// The last `n` cycles ending at `key`, oldest first — the analytics trend window. The anchor is the
// LAST element, so a chart renders left-to-right in time order with the selected cycle at the right
// edge. Built from stepKey + cycleFromKey, so it inherits the cutoff-aware boundary math.
export function lastCycles(key: string, n: number, cutoff = CUTOFF): Cycle[] {
  return Array.from({ length: n }, (_, i) => cycleFromKey(stepKey(key, i - n + 1), cutoff));
}

// The cycles keyed to a calendar year, oldest first — the /year recap's window. Keyed, not dated:
// a cycle is anchored to its START month, so `2026-01` is 18 Jan → 17 Feb and the year runs
// 18 Jan 2026 → 17 Jan 2027. That is the cost of a cutoff-based ledger; the page states the real
// span rather than pretending the year begins on the 1st.
//
// The CURRENT year stops at the live cycle (year-to-date). Future cycles are not "zero spend" —
// toTrendBars renders a missing cycle as a real zero on purpose, so leaving them in would draw
// five empty bars that read as five months of spending nothing. Keys are zero-padded 'YYYY-MM',
// so ordering them is a plain string compare.
export function cyclesInYear(year: number, currentKey: string, cutoff = CUTOFF): Cycle[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${pad2(i + 1)}`)
    .filter((key) => key <= currentKey)
    .map((key) => cycleFromKey(key, cutoff));
}

// The year of the CYCLE owning the ledger's oldest expense — how far back any year- or month-window
// may reach. Not the date's own year: an expense on 5 Jan 2025 lives in cycle 2024-12, so 2024 has
// to stay reachable or its December is unviewable. null for an empty ledger.
export function firstTrackedYear(firstDate: string | null, cutoff = CUTOFF): number | null {
  return firstDate === null ? null : Number(cycleOf(firstDate, cutoff).key.split('-')[0]);
}

// One month's cycle across every tracked year, oldest first — /month's window. `month` is 1-based.
// Same clip as cyclesInYear and for the same reason: a cycle that has not started yet is not a
// zero-spend cycle, and toTrendBars would draw it as one.
//
// Note this asks "has this month's cycle STARTED", not "has it finished" — so in the current month
// you get a partial bar alongside the finished years, flagged `partial` like everywhere else.
export function cyclesForMonth(
  month: number,
  currentKey: string,
  firstYear: number,
  cutoff = CUTOFF,
): Cycle[] {
  const lastYear = Number(currentKey.split('-')[0]);
  const keys: string[] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    const key = `${y}-${pad2(month)}`;
    if (key <= currentKey) keys.push(key);
  }
  return keys.map((key) => cycleFromKey(key, cutoff));
}

// A span's label in the same house style as a cycle's own — "18 Jan – 26 Jul 2026", with the
// start's year shown only when the span crosses one. The /year window is not a cycle, but it
// should not read as a second date dialect.
export function formatIsoRange(startIso: string, endIso: string): string {
  return formatRange(new Date(`${startIso}T00:00:00Z`), new Date(`${endIso}T00:00:00Z`));
}
