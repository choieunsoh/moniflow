// Supplementary JSON backup for the display metadata the entries CSV can't carry — category
// emoji/hue/order/archived and account icon/hue/order, plus zero-entry rows. Pure: no DB, no fs, so
// it's unit-testable; the settings page composes the DB reads and the download around it.
export type CategoryCatalogRow = {
  name: string;
  emoji: string;
  hue: number | null;
  sortOrder: number | null;
  archived: boolean;
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
export type CatalogData = {
  version: 1 | 2 | 3;
  categories: CategoryCatalogRow[];
  accounts: AccountCatalogRow[];
  recurrences: RuleCatalogRow[];
  // v3 "combined" backup only: the whole ledger as an embedded Monefy CSV. Absent in v1/v2 (which
  // carry display metadata only). Embedded rather than re-encoded as JSON so the tested Monefy
  // serializer/parser stay the single source of truth for entry fidelity.
  entriesCsv?: string;
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
    typeof v.archived === 'boolean'
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
    (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3)
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
  // A clean 1 | 2 | 3 literal without a cast (the guard above proved it is one of them).
  const version = parsed.version === 1 ? 1 : parsed.version === 2 ? 2 : 3;
  return {
    version,
    categories: parsed.categories,
    accounts: parsed.accounts,
    recurrences: rawRec,
    // Only include the key when set, so a v1/v2 file round-trips to an object without it.
    ...(entriesCsv === undefined ? {} : { entriesCsv }),
  };
}

// What kind of backup a picked file is, so the import UI can dispatch and decide whether to confirm.
// Pure and content-based — the file's extension never decides anything.
export type BackupKind =
  | { kind: 'invalid' }
  | { kind: 'monefy-csv' } // raw Monefy CSV → replaces the ledger (destructive)
  | { kind: 'catalog'; data: CatalogData } // v1/v2 JSON → merges metadata only (non-destructive)
  | { kind: 'combined'; data: CatalogData }; // v3 JSON → replaces the ledger AND merges metadata

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
