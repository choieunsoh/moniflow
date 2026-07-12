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
