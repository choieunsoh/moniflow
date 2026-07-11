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

// Fuller day label for record group headers, e.g. "Thu 4 Jul".
const dayHeadingFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Bangkok',
});

export function formatDayHeading(isoDate: string): string {
  return dayHeadingFmt.format(new Date(`${isoDate}T00:00:00Z`));
}

// Same heading with the year, e.g. "Thu 4 Jul 2026". Used by cross-cycle search results, where a
// bare "Thu 4 Jul" is ambiguous once matches span more than one year (the cycle view omits the year
// because the cycle label above already fixes it).
const dayHeadingYearFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
});

export function formatDayHeadingWithYear(isoDate: string): string {
  // en-GB inserts a comma after the weekday when a year is present ("Thu, 9 Jul 2026"). Drop it from
  // the literal parts so this matches the comma-less "Thu 9 Jul" of the yearless heading — same
  // house style, one year longer. (Operating on Intl parts, not string surgery on the date.)
  return dayHeadingYearFmt
    .formatToParts(new Date(`${isoDate}T00:00:00Z`))
    .map((part) => (part.type === 'literal' ? part.value.replace(',', '') : part.value))
    .join('');
}

// Today as a 'YYYY-MM-DD' key in Bangkok — the zone the ledger's cycles are reckoned in. Used by
// the dashboard to pick the default (current) cycle.
const isoBangkok = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });

export function todayIso(): string {
  return isoBangkok.format(new Date());
}
