// Pure schedule math for recurring rules. No DB, no network, no React — every edge case is pinned
// by schedule.test.ts.
//
// The due-date sequence is fully determined by startDate's YEAR-MONTH plus `day`:
//   D_i   = clampDay(ym(startDate) + i × intervalMonths, day)
//   seq_i = startSeq + i
// `day` (not startDate's day-of-month) is the canonical anchor, so a rule on the 31st starting in
// February has startDate '2026-02-28' and still fires on the 31st in March. Deriving `day` from
// startDate would lose that.
//
// NOTHING here reads a clock — the caller passes todayIso. That keeps it testable and keeps the
// Bangkok/UTC date policy at the boundary.

// A structural subset of Recurrence, so a full DB row is assignable without any mapping.
export type Rule = {
  day: number;
  intervalMonths: number;
  startDate: string; // YYYY-MM-DD
  startSeq: number;
  totalCount: number | null;
  lastPosted: string | null; // YYYY-MM-DD
};

export type Due = { date: string; seq: number };
export type Progress = { paid: number; total: number | null; remaining: number | null };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Day 0 of the NEXT month is the last day of this one — handles leap years without a rule table.
// `month` is 1-based; Date.UTC's month is 0-based, so passing `month` means "next month".
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// (year, 1-based month) shifted by delta months, normalized. Deliberately duplicated from
// entries/cycle.ts's private stepYM rather than exported across features — it is three lines of
// month arithmetic, and coupling the two features to share it buys nothing.
function stepYM(y: number, m: number, delta: number): [number, number] {
  const total = y * 12 + (m - 1) + delta;
  return [Math.floor(total / 12), (total % 12) + 1];
}

function ymOf(iso: string): [number, number] {
  const [y, m] = iso.split('-').map(Number);
  return [y, m];
}

// A rule on the 31st fires Feb 28 (29 in a leap year), not never.
export function clampDay(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(Math.min(day, daysInMonth(year, month)))}`;
}

// The next time (month, day) comes around, at or after today. `month` null = monthly (this month's
// `day` or next month's); a month given with `intervalMonths === 12` = yearly (this year's
// `month`/`day` or next year's). Pre-clamped for short months.
export function nextOccurrence(
  day: number,
  month: number | null,
  todayIso: string,
  intervalMonths: number,
): string {
  const [y, m] = todayIso.split('-').map(Number);
  if (intervalMonths === 12 && month !== null) {
    const thisYear = clampDay(y, month, day);
    return thisYear >= todayIso ? thisYear : clampDay(y + 1, month, day);
  }
  const thisMonth = clampDay(y, m, day);
  if (thisMonth >= todayIso) return thisMonth;
  const total = y * 12 + (m - 1) + 1;
  return clampDay(Math.floor(total / 12), (total % 12) + 1, day);
}

// The i-th due date (0-based). i = 0 is the rule's first post, which equals startDate.
export function dueDateAt(rule: Rule, i: number): string {
  const [sy, sm] = ymOf(rule.startDate);
  const [y, m] = stepYM(sy, sm, i * rule.intervalMonths);
  return clampDay(y, m, rule.day);
}

// How many posts this rule has already made. Derived from lastPosted by month arithmetic — no loop
// over history, and no stored counter to drift.
export function paidCount(rule: Rule): number {
  if (rule.lastPosted === null) return 0;
  const [sy, sm] = ymOf(rule.startDate);
  const [ly, lm] = ymOf(rule.lastPosted);
  const months = ly * 12 + (lm - 1) - (sy * 12 + (sm - 1));
  if (months < 0) return 0;
  const i = Math.floor(months / rule.intervalMonths);
  // D_i lands in lastPosted's month (or the cadence's nearest earlier one); it counts only if it
  // actually fell on or before lastPosted.
  const count = dueDateAt(rule, i) <= rule.lastPosted ? i + 1 : i;
  const cap = maxPosts(rule);
  return cap === null ? count : Math.min(count, cap);
}

// How many posts this rule will EVER make. null = open-ended subscription. An installment that
// starts at #4 of 12 has 9 posts left in it, not 12.
export function maxPosts(rule: Rule): number | null {
  return rule.totalCount === null ? null : Math.max(0, rule.totalCount - rule.startSeq + 1);
}

// Every post owed from lastPosted (exclusive) through todayIso (inclusive), in order. This is the
// sweep's work list. Idempotence falls out for free: swept twice in a day, the second call returns
// []. No lock and no "last swept" timestamp is needed anywhere.
export function duePosts(rule: Rule, todayIso: string): Due[] {
  const cap = maxPosts(rule);
  const out: Due[] = [];
  for (let i = paidCount(rule); cap === null || i < cap; i++) {
    const date = dueDateAt(rule, i);
    if (date > todayIso) break;
    if (rule.lastPosted !== null && date <= rule.lastPosted) continue;
    out.push({ date, seq: rule.startSeq + i });
  }
  return out;
}

// What the page shows. `paid` includes payments made before the rule existed (startSeq - 1), so an
// installment added at "next is #4" reads "3 of 12 paid" before it ever posts.
export function progressOf(rule: Rule): Progress {
  const paid = rule.startSeq - 1 + paidCount(rule);
  return {
    paid,
    total: rule.totalCount,
    remaining: rule.totalCount === null ? null : Math.max(0, rule.totalCount - paid),
  };
}

// The posted entry's note. The installment counter is written into the note deliberately: it keeps
// the `entries` table unchanged, so it shows in Records, search, and the CSV export for free.
// Known ceiling: hand-editing that note re-syncs nothing.
export function noteFor(rule: { name: string; totalCount: number | null }, seq: number): string {
  return rule.totalCount === null ? rule.name : `${rule.name} (${seq}/${rule.totalCount})`;
}
