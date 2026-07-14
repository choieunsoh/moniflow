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
export type CatalogData = {
  version: 1;
  categories: CategoryCatalogRow[];
  accounts: AccountCatalogRow[];
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

export function parseCatalogJson(text: string): CatalogData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (!('version' in parsed) || parsed.version !== 1) return null;
  if (!('categories' in parsed) || !Array.isArray(parsed.categories)) return null;
  if (!('accounts' in parsed) || !Array.isArray(parsed.accounts)) return null;
  if (!parsed.categories.every(isCategoryRow)) return null;
  if (!parsed.accounts.every(isAccountRow)) return null;
  return { version: 1, categories: parsed.categories, accounts: parsed.accounts };
}
