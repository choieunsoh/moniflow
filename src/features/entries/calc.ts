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
