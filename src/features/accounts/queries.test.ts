import { describe, it, expect } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureAccountsTable } from './schema';
import {
  FALLBACK_ICON,
  addAccount,
  accountIdFor,
  listAccounts,
  getAccountIconMap,
  iconForAccount,
  setAccountIcon,
  getAccountHueMap,
  hueForAccount,
  setAccountHue,
  setAccountOrder,
  getAccountOrderMap,
} from './queries';

async function db() {
  const d = makeNodeProxyDb();
  await ensureAccountsTable(d);
  return d;
}

describe('accounts queries', () => {
  it('addAccount creates a row with the fallback icon and no-ops on a dup', async () => {
    const d = await db();
    await addAccount(d, 'Cash');
    await addAccount(d, 'Cash');
    expect(await listAccounts(d)).toEqual(['Cash']);
    expect(iconForAccount(await getAccountIconMap(d), 'Cash')).toBe(FALLBACK_ICON);
  });

  it('accountIdFor resolves an existing name and creates a new one idempotently', async () => {
    const d = await db();
    const first = await accountIdFor(d, 'Bank');
    const again = await accountIdFor(d, 'Bank');
    expect(first).toBe(again);
    expect(await listAccounts(d)).toEqual(['Bank']);
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

  it('listAccounts is alphabetical', async () => {
    const d = await db();
    await addAccount(d, 'Cash');
    await addAccount(d, 'Bank');
    expect(await listAccounts(d)).toEqual(['Bank', 'Cash']);
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
