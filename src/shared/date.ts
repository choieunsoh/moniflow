// User-facing dates render in Bangkok tz via Intl (never string surgery). DB keys are
// 'YYYY-MM-DD'; parse as UTC midnight so the displayed day is stable regardless of the server's
// zone, then format for Asia/Bangkok.
const dayFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  timeZone: 'Asia/Bangkok',
});

export function formatDay(isoDate: string): string {
  return dayFmt.format(new Date(`${isoDate}T00:00:00Z`));
}

// Today as a 'YYYY-MM-DD' key in Bangkok — the zone the ledger's cycles are reckoned in. Used by
// the dashboard to pick the default (current) cycle.
const isoBangkok = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });

export function todayIso(): string {
  return isoBangkok.format(new Date());
}
