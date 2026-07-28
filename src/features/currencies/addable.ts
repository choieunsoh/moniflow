// The codes the "add a currency" picker offers: every ISO 4217 code the runtime knows, minus the ones
// already in the catalog. Intl.supportedValuesOf is the list, so a picked code is guaranteed
// formattable and no hand-maintained table can drift from it.
export function addableCurrencies(existing: Set<string>): string[] {
  return Intl.supportedValuesOf('currency')
    .filter((code) => !existing.has(code))
    .sort();
}
