import { formatBahtWhole } from '@shared/money';

// Pure budget-vs-spend model. Merges standing budgets with the current cycle's spend into ranked,
// stateful rows so the page can render a live tracker (meter + over/under state) instead of a bare
// form. No DB, no React — tested in isolation. Spend is a NET figure, not a magnitude: a refund
// files under the same category as the expense it refunds, so a refund-heavy category can spend
// below zero — see the clamp in fillPct below, which exists because of exactly that.

export type BudgetState = 'over' | 'near' | 'under' | 'none';

export type BudgetRow = {
  category: string;
  limit: number | null; // null = no budget set for this category
  spent: number; // this cycle, net — can go negative when refunds outweigh spend
  pct: number; // 0..100, clamped — the meter width
  remaining: number; // limit − spent (negative = over); 0 when no limit
  state: BudgetState;
};

export type BudgetTotal = Omit<BudgetRow, 'category'>;

// A category is "near" its cap once spend crosses this share of the limit — the warn threshold.
const NEAR = 0.8;

function classify(limit: number | null, spent: number): BudgetState {
  if (limit === null) return 'none';
  if (spent > limit) return 'over';
  if (limit > 0 && spent >= limit * NEAR) return 'near';
  return 'under';
}

// Meter fill: share of the limit spent, clamped to 0..100. With no positive limit the bar is full
// when anything was spent (a 0 budget you've spent against), empty otherwise. The lower clamp matters
// now that `spent` can be negative (a refund-heavy category nets below zero) — an unclamped negative
// pct became an invalid CSS width (`width: -10%`), which the CSSOM drops entirely, leaving the fill
// div at `width: auto` and painting the WHOLE track for a category that owes nothing.
function fillPct(limit: number | null, spent: number): number {
  if (limit !== null && limit > 0) return Math.max(0, Math.min(100, (spent / limit) * 100));
  return spent > 0 ? 100 : 0;
}

function toStatus(limit: number | null, spent: number): BudgetTotal {
  return {
    limit,
    spent,
    pct: fillPct(limit, spent),
    remaining: limit === null ? 0 : limit - spent,
    state: classify(limit, spent),
  };
}

export function toBudgetTotal(limit: number | null, spent: number): BudgetTotal {
  return toStatus(limit, spent);
}

// The meter fill color for a budget state, as a CSS var (applied via inline style). Only near/over
// deviate from the calm muted default — under-budget must not shout, and unbudgeted rows never reach
// here.
export function meterColorVar(state: BudgetState): string {
  if (state === 'over') return 'var(--color-loss)';
  if (state === 'near') return 'var(--color-warn)';
  return 'var(--color-muted)';
}

// The meter's right-hand caption. `near` and `under` used to both render a bare `${pct}%`, which left
// the difference between them carried ENTIRELY by the amber-vs-accent fill — meaning-by-colour-alone
// (WCAG 1.4.1), and against the house rule that state never rides on hue by itself. `near` now names
// itself in words, so the warning survives grayscale and colour blindness.
export function meterCaption(status: BudgetTotal): string {
  if (status.state === 'over') return `over ${formatBahtWhole(Math.abs(status.remaining))}`;
  const pct = `${Math.round(status.pct)}%`;
  return status.state === 'near' ? `${pct} · close to limit` : pct;
}

// Spend pace vs the clock: the signed gap between how much of the budget is spent and how far through
// the cycle we are. Positive → spending ahead of time ("over pace"); negative → behind ("under pace");
// within a rounded point → "on pace". Both inputs are percentages (0–100).
export function pacePhrase(spentPct: number, pacePct: number): string {
  const delta = Math.round(spentPct - pacePct);
  if (delta === 0) return 'on pace';
  return delta > 0 ? `${delta}% over pace` : `${-delta}% under pace`;
}

// A clean starting budget derived from spend: round UP to a tidy step so the suggestion reads as a
// budget ("฿9,000"), not a raw ledger figure ("฿8,918") — the page prefills this so setting a limit
// is one tap. Null when there's nothing to base a suggestion on (no spend this cycle).
export function suggestBudget(spent: number): number | null {
  if (spent <= 0) return null;
  const step = spent >= 1000 ? 500 : 100;
  return Math.ceil(spent / step) * step;
}

// Ordered by spend, biggest first — the categories most worth budgeting lead, and the order is
// STABLE as you set limits (setting a budget changes a row's state but not its spend, so it never
// jumps under you while auto-save re-renders). Ties break by name.
//
// Every category that has a budget OR spend this cycle appears exactly once. `limits` and
// `spentByCategory` are keyed by category name; `categories` seeds the union so a budgeted-but-
// unspent category still shows.
export function toBudgetRows(
  categories: string[],
  limits: Map<string, number>,
  spentByCategory: Map<string, number>,
): BudgetRow[] {
  const names = new Set([...categories, ...limits.keys(), ...spentByCategory.keys()]);
  const rows: BudgetRow[] = [];
  for (const category of names) {
    const limit = limits.get(category) ?? null;
    const spent = spentByCategory.get(category) ?? 0;
    rows.push({ category, ...toStatus(limit, spent) });
  }
  return rows.sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category));
}
