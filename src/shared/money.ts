// Cross-feature THB formatter. Lives in @shared because money rendering is not owned by any one
// feature. narrowSymbol → ฿ (not the default "THB " prefix); no fraction digits for ledger sums.
const baht = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'THB',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
});

export function formatBaht(amount: number): string {
  return baht.format(amount);
}

// Signed for the ledger: an explicit +/− (U+2212 true minus) so gain/loss reads without relying
// on color alone — the sign survives grayscale and color blindness.
export function formatSignedBaht(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${baht.format(Math.abs(amount))}`;
}
