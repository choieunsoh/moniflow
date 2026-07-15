import { describe, it, expect } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureAccountsTable } from './schema';
import {
  FALLBACK_ICON,
  addAccount,
  accountIdFor,
  getAccountIconMap,
  iconForAccount,
  setAccountIcon,
  getAccountHueMap,
  hueForAccount,
  setAccountHue,
  setAccountOrder,
  getAccountOrderMap,
  getAccountCatalog,
  restoreAccountCatalog,
} from './queries';

async function db() {
  const d = makeNodeProxyDb();
  await ensureAccountsTable(d);
  return d;
}

// "Which accounts exist", via the catalog read that actually ships. There used to be a listAccounts
// query for this, but it was a strict subset of getAccountCatalog (same table, same alphabetical
// order, fewer columns) that nothing outside these tests ever called — so the assertions moved onto
// the live query rather than keeping a parallel one alive for the test's benefit.
async function accountNames(d: Awaited<ReturnType<typeof db>>): Promise<string[]> {
  return (await getAccountCatalog(d)).map((r) => r.name);
}

describe('accounts queries', () => {
  it('addAccount creates a row with the fallback icon and no-ops on a dup', async () => {
    const d = await db();
    await addAccount(d, 'Cash');
    await addAccount(d, 'Cash');
    expect(await accountNames(d)).toEqual(['Cash']);
    expect(iconForAccount(await getAccountIconMap(d), 'Cash')).toBe(FALLBACK_ICON);
  });

  it('accountIdFor resolves an existing name and creates a new one idempotently', async () => {
    const d = await db();
    const first = await accountIdFor(d, 'Bank');
    const again = await accountIdFor(d, 'Bank');
    expect(first).toBe(again);
    expect(await accountNames(d)).toEqual(['Bank']);
  });

  it('setAccountIcon upserts the icon key', async () => {
    const d = await db();
    await addAccount(d, 'Wallet');
    await setAccountIcon(d, 'Wallet', 'qr');
    expect(iconForAccount(await getAccountIconMap(d), 'Wallet')).toBe('qr');
  });

  it('setAccountHue upserts hue and null resets to auto (undefined lookup)', async () => {
    const d = await db();
    await addAccount(d, 'Visa');
    await setAccountHue(d, 'Visa', 0); // 0 is a valid hue, must survive
    expect(hueForAccount(await getAccountHueMap(d), 'Visa')).toBe(0);
    await setAccountHue(d, 'Visa', null);
    expect(hueForAccount(await getAccountHueMap(d), 'Visa')).toBeUndefined();
  });

  // Inherited from the retired listAccounts test. getAccountCatalog orders by name and had no guard
  // of its own, so the assertion is worth more here than it was there.
  it('getAccountCatalog is alphabetical, not insertion-ordered', async () => {
    const d = await db();
    await addAccount(d, 'Cash');
    await addAccount(d, 'Bank');
    expect(await accountNames(d)).toEqual(['Bank', 'Cash']);
  });
});

describe('setAccountOrder / getAccountOrderMap', () => {
  it('writes a dense sort_order in the given order and reads it back', async () => {
    const d = await db();
    await addAccount(d, 'Cash');
    await addAccount(d, 'Card');
    await addAccount(d, 'QR');
    await setAccountOrder(d, ['QR', 'Cash', 'Card']);
    expect(await getAccountOrderMap(d)).toEqual({ QR: 0, Cash: 1, Card: 2 });
  });

  it('leaves an untouched account out of the map', async () => {
    const d = await db();
    await addAccount(d, 'Cash');
    await addAccount(d, 'Card');
    await setAccountOrder(d, ['Card']);
    const map = await getAccountOrderMap(d);
    expect(map).toEqual({ Card: 0 });
    expect('Cash' in map).toBe(false);
  });
});

describe('account catalog read/restore', () => {
  it('reads back rows and upserts by name without deleting unlisted', async () => {
    const d = await db();
    await addAccount(d, 'Keep'); // pre-existing, NOT in the restore payload
    await restoreAccountCatalog(d, [{ name: 'Cash', icon: 'cash', hue: 12, sortOrder: 0 }]);
    await restoreAccountCatalog(d, [{ name: 'Cash', icon: 'qr', hue: null, sortOrder: 3 }]); // updates existing
    const rows = await getAccountCatalog(d);
    const names = rows.map((r) => r.name);
    expect(names).toContain('Keep'); // never deleted
    const cash = rows.find((r) => r.name === 'Cash');
    expect(cash).toEqual({ name: 'Cash', icon: 'qr', hue: null, sortOrder: 3 });
  });
});
