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
