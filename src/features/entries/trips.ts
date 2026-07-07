import type { Entry } from './schema';

export type Trip = {
  currency: string;
  start: string;
  end: string;
  count: number;
  originalTotal: number;
  thbTotal: number;
};

const DAY_MS = 86_400_000;

// Same technique as cycle.ts's daysBetween: parse as UTC midnight, diff in days. No string surgery.
function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(`${bIso}T00:00:00Z`) - Date.parse(`${aIso}T00:00:00Z`)) / DAY_MS);
}

// Groups already-foreign-currency entries (see queries.getForeignEntries) into trips: a run of
// same-currency rows where consecutive dates are never more than `gapDays` apart. A currency
// change, or a gap that exceeds `gapDays`, always starts a new trip. Totals are magnitudes
// (Math.abs) of both the original-currency and THB amounts — a trip answers "how much moved", not
// "net flow", so a refund/credit row still adds to the total instead of subtracting from it.
export function groupIntoTrips(entries: Entry[], gapDays = 5): Trip[] {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const trips: Trip[] = [];
  for (const e of sorted) {
    const currency = e.currency ?? '';
    const last = trips.at(-1);
    const gap = last ? daysBetween(last.end, e.date) : 0;
    const startsNewTrip = last === undefined || last.currency !== currency || gap > gapDays;
    if (startsNewTrip) {
      trips.push({ currency, start: e.date, end: e.date, count: 0, originalTotal: 0, thbTotal: 0 });
    }
    const trip = trips.at(-1);
    if (trip) {
      trip.end = e.date;
      trip.count += 1;
      trip.originalTotal += Math.abs(e.originalAmount ?? 0);
      trip.thbTotal += Math.abs(e.amount);
    }
  }
  return trips;
}
