import type { Db } from '@db/client';
import { getCategoryCounts, getAccountsByUsage, getCurrencyCounts } from './queries';
import { CURRENCIES } from './entry-form';
import { currencySymbol } from '@shared/money';
import {
  getEmojiMap,
  emojiFor,
  getHueMap,
  hueFor,
  getCategoryOrderMap,
} from '@features/categories/queries';
import {
  getAccountIconMap,
  iconForAccount,
  getAccountHueMap,
  hueForAccount,
  getAccountOrderMap,
} from '@features/accounts/queries';
import type { KeypadCategory, KeypadAccount, KeypadCurrency } from './ui/Keypad';

// Float manually-ordered rows to the front in their chosen sequence; the rest keep their incoming
// (count / usage) order. Stable — Array.prototype.sort preserves the order of equal keys (ES2019+),
// so unset rows (sort key MAX) stay in their original relative order. Pure.
export function sortByManualOrder<T extends { name: string }>(
  items: T[],
  order: Record<string, number>,
): T[] {
  const MAX = Number.MAX_SAFE_INTEGER;
  return [...items].sort((a, b) => (order[a.name] ?? MAX) - (order[b.name] ?? MAX));
}

// The keypad's category tiles: count-desc from getCategoryCounts, re-floated by the manual order.
// Shared by the new-entry and edit routes so their grids can't drift.
export async function getKeypadCategories(db: Db): Promise<KeypadCategory[]> {
  const emojiMap = await getEmojiMap(db);
  const hueMap = await getHueMap(db);
  const list = (await getCategoryCounts(db)).map((c) => ({
    name: c.category,
    emoji: emojiFor(emojiMap, c.category),
    hue: hueFor(hueMap, c.category),
  }));
  return sortByManualOrder(list, await getCategoryOrderMap(db));
}

// The keypad's account tiles: usage-desc from getAccountsByUsage, re-floated by the manual order.
export async function getKeypadAccounts(db: Db): Promise<KeypadAccount[]> {
  const iconMap = await getAccountIconMap(db);
  const hueMap = await getAccountHueMap(db);
  const list = (await getAccountsByUsage(db)).map((name) => ({
    name,
    icon: iconForAccount(iconMap, name),
    hue: hueForAccount(hueMap, name),
  }));
  return sortByManualOrder(list, await getAccountOrderMap(db));
}

// The keypad's currency picker: THB pinned first, then the remaining currencies by ledger usage,
// with never-used ones (rank MAX) trailing in their declared order. Auto-tunes per trip — no manual
// reorder. Each entry carries its narrowSymbol glyph for the picker chips.
export async function getKeypadCurrencies(db: Db): Promise<KeypadCurrency[]> {
  const rank = new Map((await getCurrencyCounts(db)).map((c, i) => [c.currency, i]));
  const MAX = Number.MAX_SAFE_INTEGER;
  const ordered = [...CURRENCIES].sort((a, b) => {
    if (a === b) return 0;
    if (a === 'THB') return -1;
    if (b === 'THB') return 1;
    return (rank.get(a) ?? MAX) - (rank.get(b) ?? MAX);
  });
  return ordered.map((code) => ({ code, symbol: currencySymbol(code) }));
}
