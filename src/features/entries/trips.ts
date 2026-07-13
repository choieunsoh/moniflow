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
  // A trip spans more than one day. Single-day foreign spending is online shopping in a foreign
  // currency, not travel, so it's dropped from the Trips view.
  // ponytail: day-count heuristic only. Two same-currency online buys <=gapDays apart still merge
  // into a fake multi-day "trip"; tighten to require contiguous days or a min entry count if that bites.
  return trips.filter((t) => t.start !== t.end);
}

// Inclusive day span of a trip: 11 Feb – 17 Feb is 7 days, not 6. Single-day runs are already
// dropped by groupIntoTrips, so this is always >= 2 for a real trip.
export function tripDays(trip: Trip): number {
  return daysBetween(trip.start, trip.end) + 1;
}

export type CurrencySum = { currency: string; total: number };

// Sum the foreign-currency originals in a set of rows, grouped by currency (THB and unpriced rows
// are skipped). Magnitudes, like the trip totals — "how much moved", refunds included. Insertion
// order is the first-seen order, which for a date-sorted list reads chronologically.
export function sumByCurrency(entries: Entry[]): CurrencySum[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.currency && e.currency !== 'THB' && e.originalAmount != null) {
      totals.set(e.currency, (totals.get(e.currency) ?? 0) + Math.abs(e.originalAmount));
    }
  }
  return [...totals].map(([currency, total]) => ({ currency, total }));
}

// Small currency-agnostic money formatter for foreign-currency totals: mirrors formatBaht's shape
// (no fraction digits — this ledger treats money as whole units) but takes the ISO 4217 code as a
// parameter so each trip renders in its own currency's symbol (¥, HK$, ...). Built fresh per call
// rather than cached, since the currency varies per call and trip lists are small — not a hot path.
export function formatForeign(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

const dmUtc = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });

// Trip date-range label, e.g. "01 Mar – 05 Mar 2019" (same year) or "28 Dec 2019 – 03 Jan 2020"
// (crosses year) — mirrors cycle.ts's (unexported) formatRange so cycle and trip labels read
// consistently.
export function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  const sy = start.getUTCFullYear();
  const ey = end.getUTCFullYear();
  const startStr = sy === ey ? dmUtc.format(start) : `${dmUtc.format(start)} ${sy}`;
  return `${startStr} – ${dmUtc.format(end)} ${ey}`;
}

export function formatTripRange(trip: Trip): string {
  return formatDateRange(trip.start, trip.end);
}
