// Supplementary JSON backup for the display metadata the entries CSV can't carry — category
// emoji/hue/order/archived and account icon/hue/order, plus zero-entry rows. Pure: no DB, no fs, so
// it's unit-testable; the settings page composes the DB reads and the download around it.
export type CategoryCatalogRow = {
  name: string;
  emoji: string;
  hue: number | null;
  sortOrder: number | null;
  archived: boolean;
  // Whether this category's spend is excluded from the budget meters. OPTIONAL because every backup
  // written before this field existed omits it — and absent must stay absent rather than defaulting
  // to false, so restoring an old file leaves a flag the user set on this device alone.
  offBudget?: boolean;
};
export type AccountCatalogRow = {
  name: string;
  icon: string;
  hue: number | null;
  sortOrder: number | null;
};
// A recurring rule's DEFINITION for backup — not its runtime state. `lastPosted`, `startDate` and
// `startSeq` are deliberately absent (an imported rule starts fresh from its next due date); a yearly
// rule's renewal month, which otherwise lives only inside startDate, rides along as `month`.
export type RuleCatalogRow = {
  name: string;
  category: string; // by name; resolved to category_id on import
  account: string; // by name; resolved to account_id on import
  amount: number; // positive magnitude
  currency: string | null; // 'USD' etc, or null/'THB'
  rate: number | null; // pinned THB-per-unit, or null for the live rate
  day: number; // 1–31
  intervalMonths: number; // 1 monthly, 12 yearly
  month: number | null; // 1–12 for a yearly rule's renewal month; null for monthly
  totalCount: number | null; // installment length, or null for a subscription
};
// A budget for backup: keyed by category NAME (resolved to category_id on import), or null for the
// whole-cycle total row. Amount is the positive monthly limit.
export type BudgetCatalogRow = { category: string | null; amount: number };
// One row of the generic settings KV table (cutoff, icon set, font scale, card fee, keypad layout,
// and the fx-rate cache). Dumped whole rather than key-by-key so a future setting rides along for free.
export type SettingRow = { key: string; value: string };
// One currency for backup. `offBudget` marks "spending in this currency means I am abroad", which is
// configuration the user set by hand — losing it on a fresh-device restore would silently put every
// past and future trip back inside the monthly budget.
export type CurrencyCatalogRow = {
  code: string;
  offBudget: boolean;
  sortOrder: number | null;
  archived: boolean;
};

export type CatalogData = {
  version: 1 | 2 | 3 | 4;
  categories: CategoryCatalogRow[];
  accounts: AccountCatalogRow[];
  recurrences: RuleCatalogRow[];
  // The three fields below appear only in a v3 "combined" backup; v1/v2 catalog files carry display
  // metadata only. entriesCsv embeds the whole ledger as a Monefy CSV (so the tested serializer/parser
  // stay the single source of truth for entry fidelity); budgets and settings ride along as their own
  // rows. All optional so an older/leaner file still parses.
  entriesCsv?: string;
  budgets?: BudgetCatalogRow[];
  settings?: SettingRow[];
  // v4 only: the currency catalog. Optional so every older file still parses.
  currencies?: CurrencyCatalogRow[];
};

export function serializeCatalogJson(data: CatalogData): string {
  return JSON.stringify(data, null, 2);
}

function isNumOrNull(v: unknown): v is number | null {
  return v === null || typeof v === 'number';
}
function isCategoryRow(v: unknown): v is CategoryCatalogRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'name' in v &&
    typeof v.name === 'string' &&
    'emoji' in v &&
    typeof v.emoji === 'string' &&
    'hue' in v &&
    isNumOrNull(v.hue) &&
    'sortOrder' in v &&
    isNumOrNull(v.sortOrder) &&
    'archived' in v &&
    typeof v.archived === 'boolean' &&
    // Optional: absent is valid (a pre-off-budget backup); present must be a boolean.
    (!('offBudget' in v) || typeof v.offBudget === 'boolean')
  );
}
function isAccountRow(v: unknown): v is AccountCatalogRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'name' in v &&
    typeof v.name === 'string' &&
    'icon' in v &&
    typeof v.icon === 'string' &&
    'hue' in v &&
    isNumOrNull(v.hue) &&
    'sortOrder' in v &&
    isNumOrNull(v.sortOrder)
  );
}
function isStrOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}
function isRuleRow(v: unknown): v is RuleCatalogRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'name' in v &&
    typeof v.name === 'string' &&
    'category' in v &&
    typeof v.category === 'string' &&
    'account' in v &&
    typeof v.account === 'string' &&
    'amount' in v &&
    typeof v.amount === 'number' &&
    'currency' in v &&
    isStrOrNull(v.currency) &&
    'rate' in v &&
    isNumOrNull(v.rate) &&
    'day' in v &&
    typeof v.day === 'number' &&
    'intervalMonths' in v &&
    typeof v.intervalMonths === 'number' &&
    'month' in v &&
    isNumOrNull(v.month) &&
    'totalCount' in v &&
    isNumOrNull(v.totalCount)
  );
}

function isBudgetRow(v: unknown): v is BudgetCatalogRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'category' in v &&
    isStrOrNull(v.category) &&
    'amount' in v &&
    typeof v.amount === 'number'
  );
}
function isCurrencyRow(v: unknown): v is CurrencyCatalogRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'code' in v &&
    typeof v.code === 'string' &&
    'offBudget' in v &&
    typeof v.offBudget === 'boolean' &&
    'sortOrder' in v &&
    isNumOrNull(v.sortOrder) &&
    'archived' in v &&
    typeof v.archived === 'boolean'
  );
}
function isSettingRow(v: unknown): v is SettingRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'key' in v &&
    typeof v.key === 'string' &&
    'value' in v &&
    typeof v.value === 'string'
  );
}

export function parseCatalogJson(text: string): CatalogData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (
    !('version' in parsed) ||
    (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4)
  )
    return null;
  if (!('categories' in parsed) || !Array.isArray(parsed.categories)) return null;
  if (!('accounts' in parsed) || !Array.isArray(parsed.accounts)) return null;
  if (!parsed.categories.every(isCategoryRow)) return null;
  if (!parsed.accounts.every(isAccountRow)) return null;
  // recurrences is absent in a v1 file → []; present → every row must validate. All-or-nothing,
  // exactly like categories/accounts above.
  const rawRec = 'recurrences' in parsed ? parsed.recurrences : [];
  if (!Array.isArray(rawRec) || !rawRec.every(isRuleRow)) return null;
  // entriesCsv marks a v3 combined backup; when present it must be a string. Absent in v1/v2.
  let entriesCsv: string | undefined;
  if ('entriesCsv' in parsed) {
    if (typeof parsed.entriesCsv !== 'string') return null;
    entriesCsv = parsed.entriesCsv;
  }
  // budgets/settings are v3-only extras; when present each row must validate (all-or-nothing).
  let budgets: BudgetCatalogRow[] | undefined;
  if ('budgets' in parsed) {
    if (!Array.isArray(parsed.budgets) || !parsed.budgets.every(isBudgetRow)) return null;
    budgets = parsed.budgets;
  }
  let settingsRows: SettingRow[] | undefined;
  if ('settings' in parsed) {
    if (!Array.isArray(parsed.settings) || !parsed.settings.every(isSettingRow)) return null;
    settingsRows = parsed.settings;
  }
  // currencies is a v4-only extra; when present each row must validate (all-or-nothing).
  let currencyRows: CurrencyCatalogRow[] | undefined;
  if ('currencies' in parsed) {
    if (!Array.isArray(parsed.currencies) || !parsed.currencies.every(isCurrencyRow)) return null;
    currencyRows = parsed.currencies;
  }
  // A clean 1 | 2 | 3 | 4 literal without a cast (the guard above proved it is one of them).
  const version =
    parsed.version === 1 ? 1 : parsed.version === 2 ? 2 : parsed.version === 3 ? 3 : 4;
  return {
    version,
    categories: parsed.categories,
    accounts: parsed.accounts,
    recurrences: rawRec,
    // Only include each optional key when set, so a leaner file round-trips to an object without it.
    ...(entriesCsv === undefined ? {} : { entriesCsv }),
    ...(budgets === undefined ? {} : { budgets }),
    ...(settingsRows === undefined ? {} : { settings: settingsRows }),
    ...(currencyRows === undefined ? {} : { currencies: currencyRows }),
  };
}

// What kind of backup a picked file is, so the import UI can dispatch and decide whether to confirm.
// Pure and content-based — the file's extension never decides anything.
export type BackupKind =
  | { kind: 'invalid' }
  | { kind: 'monefy-csv' } // raw Monefy CSV → replaces the ledger (destructive)
  | { kind: 'catalog'; data: CatalogData } // v1/v2 JSON → merges metadata only (non-destructive)
  | { kind: 'combined'; data: CatalogData }; // versioned JSON → replaces the ledger AND merges metadata

// A Monefy CSV's header line names these three columns (in any order). Cheap sniff; the real parse
// runs on apply, so a false positive just yields a "couldn't read that backup" toast, not corruption.
function looksLikeMonefyCsv(text: string): boolean {
  const cols = (text.split(/\r?\n/, 1)[0] ?? '').split(',').map((c) => c.trim());
  return cols.includes('date') && cols.includes('amount') && cols.includes('category');
}

export function classifyBackup(text: string): BackupKind {
  const data = parseCatalogJson(text);
  if (data !== null) {
    return data.entriesCsv === undefined ? { kind: 'catalog', data } : { kind: 'combined', data };
  }
  return looksLikeMonefyCsv(text) ? { kind: 'monefy-csv' } : { kind: 'invalid' };
}
