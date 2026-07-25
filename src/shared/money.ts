// Cross-feature THB formatter. Lives in @shared because money rendering is not owned by any one
// feature. narrowSymbol → ฿ (not the default "THB " prefix).
//
// Money always states its satang: ฿228.00, never ฿228. `amount` is a real column and the keypad
// stores what you key in, so rounding ฿1,234.56 to ฿1,235 here made every THB surface disagree with
// the ledger it reads from (the foreign formatter below never did — Intl gives THB 2 digits by
// default). The two digits are unconditional so a column of amounts shares one shape and the decimal
// points line up under .tnum; Intl rounds to them itself, which also absorbs the IEEE-754 drift that
// summed reals carry (1234.56 + 120 → 1354.5600000000002 → ฿1,354.56).
const baht = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'THB',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBaht(amount: number): string {
  return baht.format(amount);
}

// Whole-baht THB, for glance figures that would rather be short than exact — the donut hole, where
// ฿1,355 beats ฿1,354.56 as the biggest number on the page and the ranked breakdown beside it
// carries the precise total. Not for ledger rows: those state their satang via formatBaht.
const bahtWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'THB',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
});

export function formatBahtWhole(amount: number): string {
  return bahtWhole.format(amount);
}

// THB as keyed, for the keypad's amount: it echoes the figure you typed rather than restating it as
// a ledger row, so ฿123 stays ฿123 and ฿123.1 stays ฿123.1. Padding an input to ฿123.10 puts digits
// on screen the user didn't type — and a 0 that appears under the cursor by itself reads like the
// keypad took a keystroke it didn't. Grouping and the 2-decimal cap still apply; the entry becomes a
// ledger figure (฿123.10) once it's saved and Records renders it via formatBaht.
const bahtKeyed = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'THB',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatBahtKeyed(amount: number): string {
  return bahtKeyed.format(amount);
}

// Signed for the ledger: an explicit +/− (U+2212 true minus) so gain/loss reads without relying
// on color alone — the sign survives grayscale and color blindness. Formats through formatBaht so
// the ledger's signed figures carry satang exactly like every unsigned one.
export function formatSignedBaht(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${formatBaht(Math.abs(amount))}`;
}

// Per-currency Intl formatter, memoized. narrowSymbol → ¥, ₩, $, €, HK$, £, S$, ฿; Intl picks the
// correct fraction digits per currency automatically (JPY/KRW → 0, most others → 2). Used for
// foreign-currency entry display on the keypad; THB rollups keep formatBaht above.
const currencyFormatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  const existing = currencyFormatters.get(currency);
  if (existing !== undefined) return existing;
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  });
  currencyFormatters.set(currency, fmt);
  return fmt;
}

export function formatCurrency(amount: number, currency: string): string {
  return formatterFor(currency).format(amount);
}

// Whole-unit variant of formatCurrency, for glance lines that would rather be short than exact
// (the Upcoming line). narrowSymbol per currency, rounded to the unit — THB → ฿107, USD → $107.
const wholeCurrencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatCurrencyWhole(amount: number, currency: string): string {
  const existing = wholeCurrencyFormatters.get(currency);
  if (existing !== undefined) return existing.format(amount);
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  });
  wholeCurrencyFormatters.set(currency, fmt);
  return fmt.format(amount);
}

// Just the symbol glyph (for picker chips), extracted from Intl parts — no hand-maintained table.
export function currencySymbol(currency: string): string {
  const part = formatterFor(currency)
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part === undefined ? currency : part.value;
}
