import { isCurrency } from '@features/entries/entry-form';
import { clampDay } from './schedule';

// Pure FormData → rule parser. Mirrors entries/entry-form.ts's shape: a discriminated result rather
// than a throw, so the form can render the message. Validation lives HERE, not in the <input min/max>
// — that only constrains well-behaved browsers.
//
// Carries account/category NAMES; the action resolves them to ids at the DB boundary, exactly as
// EntryInput does.

export type RuleInput = {
  name: string;
  day: number;
  intervalMonths: number;
  account: string;
  category: string;
  amount: number;
  currency: string | null;
  rate: number | null;
  totalCount: number | null;
  startSeq: number;
  startDate: string;
};

export type ParseResult = { ok: true; rule: RuleInput } | { ok: false; error: string };

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

// An empty field means "not set" for the optional numerics (rate, totalCount).
function optionalNumber(formData: FormData, key: string): number | null {
  const raw = str(formData, key);
  return raw === '' ? null : Number(raw);
}

// The rule this parse is REPLACING, when editing. Only the two fields that decide whether the
// schedule anchor may move.
export type CurrentRule = { startDate: string; intervalMonths: number };

// The next time (month, day) comes around, at or after today. `month` null = monthly, so the next
// occurrence is this month or the next one; a month given = yearly, so it is this year or the next.
// Pre-clamped, so a 31st rule landing in February stores '2026-02-28' while `day` stays 31 — which is
// what lets schedule.ts return to the 31st in March.
function nextOccurrence(
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

// startDate is the sequence's ANCHOR: schedule.ts steps from its year-month, and paidCount measures
// lastPosted against it. Recomputing it on every edit therefore silently rewrites how many payments
// you have made — change a Fridge installment's amount and its progress rewinds, and the sweep
// re-posts payments 4, 5 and 6 as duplicates. So an edit KEEPS the anchor.
//
// It moves only when the schedule genuinely changed: a different cadence, or a yearly rule pointed at
// a different month. Both are new schedules, and rewinding progress is the honest answer to them.
// (`day` alone never moves it — schedule.ts reads the day from `day`, using only the anchor's
// year-month, so a day change re-aims the existing sequence without disturbing its count.)
function resolveStartDate(
  day: number,
  month: number | null,
  intervalMonths: number,
  todayIso: string,
  current: CurrentRule | undefined,
): string {
  if (current === undefined) return nextOccurrence(day, month, todayIso, intervalMonths);
  if (current.intervalMonths !== intervalMonths) {
    return nextOccurrence(day, month, todayIso, intervalMonths);
  }
  if (intervalMonths === 12 && month !== null) {
    const currentMonth = Number(current.startDate.split('-')[1]);
    if (currentMonth !== month) return nextOccurrence(day, month, todayIso, intervalMonths);
  }
  return current.startDate;
}

export function parseRuleForm(
  formData: FormData,
  todayIso: string,
  current?: CurrentRule,
): ParseResult {
  const name = str(formData, 'name');
  if (!name) return { ok: false, error: 'Give the rule a name.' };

  const account = str(formData, 'account');
  if (!account) return { ok: false, error: 'Choose an account.' };

  const category = str(formData, 'category');
  if (!category) return { ok: false, error: 'Choose a category.' };

  const day = Number(str(formData, 'day'));
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return { ok: false, error: 'Day must be between 1 and 31.' };
  }

  const intervalMonths = Number(str(formData, 'intervalMonths'));
  if (intervalMonths !== 1 && intervalMonths !== 12) {
    return { ok: false, error: 'Choose monthly or yearly.' };
  }

  // Which month a yearly rule renews in. Meaningless for a monthly rule (it renews in all of them),
  // so it is only read — and only validated — when the cadence is yearly.
  const month = optionalNumber(formData, 'month');
  if (intervalMonths === 12) {
    if (month === null || !Number.isInteger(month) || month < 1 || month > 12) {
      return { ok: false, error: 'Choose which month a yearly rule renews in.' };
    }
  }

  const amount = Number(str(formData, 'amount'));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }

  const currency = str(formData, 'currency');
  if (!isCurrency(currency)) return { ok: false, error: 'Choose a valid currency.' };

  const rate = optionalNumber(formData, 'rate');
  if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) {
    return { ok: false, error: 'A pinned rate must be greater than zero.' };
  }

  const totalCount = optionalNumber(formData, 'totalCount');
  if (totalCount !== null && (!Number.isInteger(totalCount) || totalCount < 1)) {
    return { ok: false, error: 'Number of payments must be a whole number of 1 or more.' };
  }

  const startSeqRaw = optionalNumber(formData, 'startSeq');
  const startSeq = startSeqRaw ?? 1;
  if (!Number.isInteger(startSeq) || startSeq < 1) {
    return { ok: false, error: 'The next payment number must be 1 or more.' };
  }
  if (totalCount !== null && startSeq > totalCount) {
    return { ok: false, error: 'The next payment number is past the total.' };
  }

  return {
    ok: true,
    rule: {
      name,
      day,
      intervalMonths,
      account,
      category,
      amount,
      currency,
      rate,
      totalCount,
      startSeq,
      startDate: resolveStartDate(
        day,
        intervalMonths === 12 ? month : null,
        intervalMonths,
        todayIso,
        current,
      ),
    },
  };
}
