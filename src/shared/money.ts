// Cross-feature THB formatter. Lives in @shared because money rendering is not owned by any one
// feature. narrowSymbol → ฿ (not the default "THB " prefix).
//
// Satang or nothing: `amount` is a real column and the keypad stores what you key in, so rounding
// ฿1,234.56 to ฿1,235 here made every THB surface disagree with the ledger it reads from — the
// foreign-currency formatter below never did (Intl gives THB 2 digits by default). A whole amount
// still renders plain (฿120, not ฿120.00) because most entries are whole baht and a column of
// trailing .00 is noise; once there are satang, both digits show (฿1,234.50, never ฿1,234.5).
const bahtWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'THB',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
});
const bahtSatang = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'THB',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBaht(amount: number): string {
  // Round to satang BEFORE the whole-number test, or IEEE-754 drift decides the format: summing
  // reals lands on 1354.5600000000002 (→ .56, fine) but also 119.99999999999999, which is ฿120 and
  // must not render as ฿120.00 just because the bits say it isn't an integer.
  const satang = Math.round(amount * 100) / 100;
  return Number.isInteger(satang) ? bahtWhole.format(satang) : bahtSatang.format(satang);
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

// Just the symbol glyph (for picker chips), extracted from Intl parts — no hand-maintained table.
export function currencySymbol(currency: string): string {
  const part = formatterFor(currency)
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part === undefined ? currency : part.value;
}
