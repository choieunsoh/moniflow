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

// Attention-first ordering: the rows a user needs to act on float up. Over budget first, then
// nearing it, then comfortably under, then untracked spend (no budget). Ties break by spend
// (biggest first), then name for a stable order.
const ORDER: Record<BudgetState, number> = { over: 0, near: 1, under: 2, none: 3 };

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
  return rows.sort(
    (a, b) =>
      ORDER[a.state] - ORDER[b.state] || b.spent - a.spent || a.category.localeCompare(b.category),
  );
}
