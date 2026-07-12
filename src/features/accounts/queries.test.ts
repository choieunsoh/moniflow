import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
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

function db() {
  const d = initDb(':memory:');
  ensureAccountsTable(d);
  return d;
}

describe('accounts queries', () => {
  it('addAccount creates a row with the fallback icon and no-ops on a dup', () => {
    const d = db();
    addAccount(d, 'Cash');
    addAccount(d, 'Cash');
    expect(listAccounts(d)).toEqual(['Cash']);
    expect(iconForAccount(getAccountIconMap(d), 'Cash')).toBe(FALLBACK_ICON);
  });

  it('accountIdFor resolves an existing name and creates a new one idempotently', () => {
    const d = db();
    const first = accountIdFor(d, 'Bank');
    const again = accountIdFor(d, 'Bank');
    expect(first).toBe(again);
    expect(listAccounts(d)).toEqual(['Bank']);
  });

  it('setAccountIcon upserts the icon key', () => {
    const d = db();
    addAccount(d, 'Wallet');
    setAccountIcon(d, 'Wallet', 'qr');
    expect(iconForAccount(getAccountIconMap(d), 'Wallet')).toBe('qr');
  });

  it('setAccountHue upserts hue and null resets to auto (undefined lookup)', () => {
    const d = db();
    addAccount(d, 'Visa');
    setAccountHue(d, 'Visa', 0); // 0 is a valid hue, must survive
    expect(hueForAccount(getAccountHueMap(d), 'Visa')).toBe(0);
    setAccountHue(d, 'Visa', null);
    expect(hueForAccount(getAccountHueMap(d), 'Visa')).toBeUndefined();
  });

  it('listAccounts is alphabetical', () => {
    const d = db();
    addAccount(d, 'Cash');
    addAccount(d, 'Bank');
    expect(listAccounts(d)).toEqual(['Bank', 'Cash']);
  });
});

describe('setAccountOrder / getAccountOrderMap', () => {
  it('writes a dense sort_order in the given order and reads it back', () => {
    const d = db();
    addAccount(d, 'Cash');
    addAccount(d, 'Card');
    addAccount(d, 'QR');
    setAccountOrder(d, ['QR', 'Cash', 'Card']);
    expect(getAccountOrderMap(d)).toEqual({ QR: 0, Cash: 1, Card: 2 });
  });

  it('leaves an untouched account out of the map', () => {
    const d = db();
    addAccount(d, 'Cash');
    addAccount(d, 'Card');
    setAccountOrder(d, ['Card']);
    const map = getAccountOrderMap(d);
    expect(map).toEqual({ Card: 0 });
    expect('Cash' in map).toBe(false);
  });
});
