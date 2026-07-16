// Month number (1-based) → name, via Intl (a fixed UTC day in that month, formatted). No
// hand-maintained name table; matches the app's Intl-only date policy. Shared by the rule keypad
// (which offers a picker and names the month in full) and the rule row (which labels a yearly rule's
// chip with the short name), so the two spell a month the same way.
const monthShortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const monthLongFmt = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });

export function monthName(m: number, long = false): string {
  const d = new Date(Date.UTC(2020, m - 1, 1));
  return (long ? monthLongFmt : monthShortFmt).format(d);
}
