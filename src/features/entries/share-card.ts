import { formatBahtWhole } from '@shared/money';
import type { BudgetTotal } from '@features/budgets/budget-status';
import { drawnTotal, type DonutSlice } from './donut';
import { tomorrowAllowance } from './dashboard';

// The cycle summary, reduced to the handful of strings a shareable image can hold. Pure and
// formatted here so the renderer (ui/ShareCardButton) only positions text on a canvas — the same
// split the charts use, and the reason this file is the only part of the feature with tests.
//
// A share card is not the Home page shrunk: a phone screenshot already does that, badly (browser
// chrome, bottom bar, whatever was mid-scroll). This states the cycle's answer and nothing else.

export type ShareKpi = { label: string; value: string };

// One list, carrying both the wedge (value, color) and its caption (amount, share). They were two
// lists for one draft, and that is exactly how a ring and its legend drift apart.
export type ShareRow = {
  name: string;
  value: number;
  amount: string;
  share: string;
  color: string;
};

export type ShareCard = {
  title: string;
  headlineLabel: string;
  headline: string;
  kpis: ShareKpi[];
  rows: ShareRow[];
};

export type ShareCardInput = {
  label: string;
  grossSpend: number;
  count: number;
  slices: DonutSlice[];
  totalStatus: BudgetTotal | null;
  // Current-cycle-only figures; null on a past cycle, exactly as useHome hands them over.
  forward: { safePerDay: number | null; daysLeft: number } | null;
};

export function buildShareCard(input: ShareCardInput): ShareCard {
  const { label, grossSpend, count, slices, totalStatus, forward } = input;
  // The ring's own sum, never `grossSpend`: every drawn slice is a positive magnitude while the
  // headline is the signed net, so on a cycle with refunds the two differ by exactly the refunded
  // amount and shares divided by the headline overshoot 100%.
  const ringTotal = drawnTotal(slices);
  const tomorrow =
    forward === null || forward.safePerDay === null
      ? null
      : tomorrowAllowance(forward.safePerDay, forward.daysLeft);

  // EVERY wedge gets a caption — there is no separate cap here on purpose. The ring already folded
  // its tail into Other at MAX_SLICES, so the list is at most eight rows and the shares sum to 100%;
  // a second cap on top of that fold would leave wedges on the card that nothing names. Sorted by
  // size because toDonutSlices appends Other LAST regardless of how big it is, and on a long-tailed
  // cycle that bucket outranks half the categories above it.
  const rows = [...slices]
    .sort((a, b) => b.value - a.value)
    .map((s) => ({
      name: s.name,
      value: s.value,
      amount: formatBahtWhole(s.value),
      share: `${ringTotal === 0 ? 0 : Math.round((s.value / ringTotal) * 100)}%`,
      color: s.color,
    }));

  // Priority order, filtered by what this cycle actually has. Budget first (it is the only figure
  // here with a target behind it), then the rate it implies, then the two counts that always exist —
  // so a past cycle with no budget still fills the row instead of leaving a gap.
  const candidates: (ShareKpi | null)[] = [
    totalStatus === null || totalStatus.limit === null
      ? null
      : totalStatus.remaining < 0
        ? { label: 'Over budget by', value: formatBahtWhole(-totalStatus.remaining) }
        : { label: 'Left of budget', value: formatBahtWhole(totalStatus.remaining) },
    forward === null || forward.safePerDay === null
      ? null
      : { label: 'Left per day', value: formatBahtWhole(forward.safePerDay) },
    // Tomorrow's figure if nothing more is spent today, from the same helper the Home card prints —
    // it drops out on the cycle's last day, when there is no tomorrow left to spread anything over.
    tomorrow === null ? null : { label: 'Tomorrow', value: formatBahtWhole(tomorrow) },
    { label: 'Transactions', value: String(count) },
    { label: 'Categories', value: String(slices.length) },
  ];

  return {
    // The cycle label IS its date range ("18 Aug – 17 Sep 2026"), so there is no second line to put
    // under it. A first draft printed formatIsoRange as a subtitle and rendered the same string twice.
    title: label,
    headlineLabel: 'Spent this cycle',
    headline: formatBahtWhole(grossSpend),
    kpis: candidates.filter((k) => k !== null).slice(0, 3),
    rows,
  };
}
