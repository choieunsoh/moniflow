// Pure budget-vs-spend model. Merges standing budgets with the current cycle's spend into ranked,
// stateful rows so the page can render a live tracker (meter + over/under state) instead of a bare
// form. No DB, no React — tested in isolation. Spend is always a magnitude (the ledger stores
// outflow as negative; callers pass Math.abs).

export type BudgetState = 'over' | 'near' | 'under' | 'none';

export type BudgetRow = {
  category: string;
  limit: number | null; // null = no budget set for this category
  spent: number; // this cycle, magnitude ≥ 0
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

// Meter fill: share of the limit spent, capped at 100. With no positive limit the bar is full when
// anything was spent (a 0 budget you've spent against), empty otherwise.
function fillPct(limit: number | null, spent: number): number {
  if (limit !== null && limit > 0) return Math.min(100, (spent / limit) * 100);
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
// deviate from the calm accent — under-budget must not shout, and unbudgeted rows never reach here.
export function meterColorVar(state: BudgetState): string {
  if (state === 'over') return 'var(--color-loss)';
  if (state === 'near') return 'var(--color-warn)';
  return 'var(--color-accent)';
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

// One cycle's verdict for one budgeted category. `spent` is a magnitude ≥ 0; a cycle where the
// category saw no spend is a real 0, not a gap.
export type FitCycle = { key: string; label: string; spent: number; over: boolean };

export type BudgetFitRow = {
  category: string;
  limit: number;
  cycles: FitCycle[];
  heldCount: number; // cycles where spend stayed within the limit
};

// Budgets are STANDING — one row per category, no cycle column, and setBudget delete+inserts. There
// is no record of what any past cycle's limit was, so this CANNOT be a compliance record. It answers
// the question the data can actually answer: "with the limits I have now, how often would I have
// blown them?" — a budget-tuning tool. The UI must label it "Against your current limits."
//
// `window` is a structural { key, label }[] rather than entries' Cycle so this file stays free of a
// feature import (the arrow runs entries → budgets, never back).
//
// Only budgeted categories appear: spend with no limit has nothing to fit against. Ranked worst-fit
// first — the budgets most worth revisiting lead. Ties break by name for a stable order.
export function toBudgetFitRows(
  limits: Map<string, number>,
  matrix: Map<string, Map<string, number>>,
  window: { key: string; label: string }[],
): BudgetFitRow[] {
  const rows: BudgetFitRow[] = [];
  for (const [category, limit] of limits) {
    const cycles = window.map(({ key, label }) => {
      const spent = matrix.get(key)?.get(category) ?? 0;
      // `>` not `>=`: spend exactly at the limit is within it, matching classify()'s over rule.
      return { key, label, spent, over: spent > limit };
    });
    rows.push({
      category,
      limit,
      cycles,
      heldCount: cycles.filter((c) => !c.over).length,
    });
  }
  return rows.sort((a, b) => a.heldCount - b.heldCount || a.category.localeCompare(b.category));
}
