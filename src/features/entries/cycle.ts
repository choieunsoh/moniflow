// Billing-cycle math for the money-flow dashboard. Pure, no DB. The user's credit card cuts off
// on the 18th, so a "cycle" runs the 18th → the 17th of the next month and is anchored (keyed) to
// its START month. One global cutoff for now; per-card cutoffs are a later slice.
export const CUTOFF = 18;

export type Cycle = { key: string; start: string; end: string; label: string };

const dmUtc = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const isoUtc = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' });

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatRange(start: Date, end: Date): string {
  const sy = start.getUTCFullYear();
  const ey = end.getUTCFullYear();
  const startStr = sy === ey ? dmUtc.format(start) : `${dmUtc.format(start)} ${sy}`;
  return `${startStr} – ${dmUtc.format(end)} ${ey}`;
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
