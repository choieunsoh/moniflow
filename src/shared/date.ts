// User-facing dates render in Bangkok tz via Intl (never string surgery). DB keys are
// 'YYYY-MM-DD'; parse as UTC midnight so the displayed day is stable regardless of the reader's
// zone, then format for Asia/Bangkok.

// CLDR 42 gave en-GB a four-letter abbreviated September ("Sept") while every other month stays at
// three, so a month label's width jumps once a year. Narrow it back — no other English month name
// contains "Sept", so this only ever touches September. Exported because every short-month
// formatter in the app (cycle labels, trend axis, trip headings) needs the same trim.
export function toThreeLetterMonth(formatted: string): string {
  return formatted.replace('Sept', 'Sep');
}

// Day label for record group headers, e.g. "Thu 4 Jul".
const dayHeadingFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Bangkok',
});

export function formatDayHeading(isoDate: string): string {
  return toThreeLetterMonth(dayHeadingFmt.format(new Date(`${isoDate}T00:00:00Z`)));
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
  return toThreeLetterMonth(
    dayHeadingYearFmt
      .formatToParts(new Date(`${isoDate}T00:00:00Z`))
      .map((part) => (part.type === 'literal' ? part.value.replace(',', '') : part.value))
      .join(''),
  );
}

// Today as a 'YYYY-MM-DD' key in Bangkok — the zone the ledger's cycles are reckoned in. Used by
// the dashboard to pick the default (current) cycle.
const isoBangkok = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });

export function todayIso(): string {
  return isoBangkok.format(new Date());
}
