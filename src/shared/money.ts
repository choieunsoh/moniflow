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
