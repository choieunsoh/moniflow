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

// The rule's first due date: this month's `day` if it has not passed yet, otherwise next month's.
// Pre-clamped, so a 31st rule starting in February stores '2026-02-28' while `day` stays 31 — which
// is what lets schedule.ts return to the 31st in March.
function firstDueDate(day: number, todayIso: string): string {
  const [y, m] = todayIso.split('-').map(Number);
  const thisMonth = clampDay(y, m, day);
  if (thisMonth >= todayIso) return thisMonth;
  const total = y * 12 + (m - 1) + 1;
  return clampDay(Math.floor(total / 12), (total % 12) + 1, day);
}

export function parseRuleForm(formData: FormData, todayIso: string): ParseResult {
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
      startDate: firstDueDate(day, todayIso),
    },
  };
}
