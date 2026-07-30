import type { KeypadLayout } from '@features/settings/queries';

export const OPS = '+−×÷';

// The 4-column key grid, shared by EVERY money-entry surface (the ledger keypad and the recurring-
// rule keypad) so one Settings choice moves all of them. Only the digit rows differ: 'calc' is
// calculator order (7-8-9 top), 'phone' is telephone/ATM order (1-2-3 top). The operator column
// (÷ × − +) and the bottom row (. 0 ⌫ +) are identical in both.
//
// This lives beside the calculator's grammar rather than in a component: it's the alphabet nextExpr
// consumes, and a second surface hardcoding its own copy is exactly how the rule keypad silently
// ignored the layout setting for two releases.
export const KEYPAD_KEYS = {
  calc: ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', '⌫', '+'],
  phone: ['1', '2', '3', '÷', '4', '5', '6', '×', '7', '8', '9', '−', '.', '0', '⌫', '+'],
} as const satisfies Record<KeypadLayout, readonly string[]>;

// The most decimals a keyed figure may carry. Satang is the smallest THB unit, and every supported
// foreign currency is 2-decimal or coarser (JPY/KRW have none), so 2 is the floor for all of them.
const MAX_DECIMALS = 2;

// The digits of the number currently being keyed — i.e. after the last operator.
function currentSegment(expr: string): string {
  return expr.split(/[+−×÷]/).pop() ?? '';
}

// Advance the amount expression by one key press, with light guards (no leading operator, no double
// operator, one decimal point per number, at most 2 decimals). Arithmetic itself is `evaluate`.
// Lives here rather than in the Keypad component so the guards are unit-testable without mounting it.
export function nextExpr(prev: string, key: string): string {
  if (key === '⌫') return prev.slice(0, -1);
  const last = prev.slice(-1);
  if (OPS.includes(key)) {
    if (prev === '') return prev;
    return OPS.includes(last) ? prev.slice(0, -1) + key : prev + key;
  }
  if (key === '.') {
    if (currentSegment(prev).includes('.')) return prev;
    return prev === '' || OPS.includes(last) ? prev + '0.' : prev + '.';
  }
  // digit — refuse it once this number already has its 2 decimals, so the keypad can't key in
  // precision the ledger would then round away when it renders.
  const segment = currentSegment(prev);
  const dot = segment.indexOf('.');
  if (dot !== -1 && segment.length - dot - 1 >= MAX_DECIMALS) return prev;
  return prev + key;
}

// A tiny, safe arithmetic evaluator for the entry keypad — supports + − × ÷ over decimals with the
// usual ×/÷ before +/− precedence, left-to-right. No eval / Function. Returns null for empty or
// malformed input and for division by zero, so callers can gate submission on a real number.
export function evaluate(expr: string): number | null {
  const normalized = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const tokens = normalized.match(/\d*\.?\d+|[+\-*/]/g);
  if (!tokens) return null;

  // A dangling trailing operator (e.g. "12+") just evaluates the part before it.
  while (tokens.length > 0 && '+-*/'.includes(tokens[tokens.length - 1])) tokens.pop();
  if (tokens.length === 0) return null;

  // Split into a number/operator sequence that must read number (op number)*.
  const nums: number[] = [];
  const ops: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0) {
      const n = Number(tokens[i]);
      if (!Number.isFinite(n)) return null;
      nums.push(n);
    } else {
      if (!'+-*/'.includes(tokens[i])) return null;
      ops.push(tokens[i]);
    }
  }
  if (nums.length !== ops.length + 1) return null;

  // Pass 1: resolve × and ÷ left-to-right.
  const rest: number[] = [nums[0]];
  const addSub: string[] = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const rhs = nums[k + 1];
    if (op === '*') {
      rest[rest.length - 1] *= rhs;
    } else if (op === '/') {
      if (rhs === 0) return null;
      rest[rest.length - 1] /= rhs;
    } else {
      addSub.push(op);
      rest.push(rhs);
    }
  }

  // Pass 2: resolve + and −.
  let result = rest[0];
  for (let k = 0; k < addSub.length; k++) {
    result = addSub[k] === '+' ? result + rest[k + 1] : result - rest[k + 1];
  }
  return Number.isFinite(result) ? result : null;
}
