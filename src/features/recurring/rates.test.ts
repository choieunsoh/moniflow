import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureSettingsTable } from '@features/settings/schema';
import { setCardFeePct, setFxRates } from '@features/settings/queries';
import { resolveRate, convertAmount } from './rates';

async function db() {
  const d = makeNodeProxyDb();
  await ensureSettingsTable(d);
  await setCardFeePct(d, 2.5);
  return d;
}

// frankfurter returns foreign-per-THB; parseEcbResponse inverts. 1/0.0275 ≈ 36.36 THB per USD.
function ecbResponse(date: string, perThb: number): Response {
  return new Response(JSON.stringify({ base: 'THB', date, rates: { USD: perThb } }), {
    status: 200,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveRate', () => {
  it('uses a pinned rate without touching the network', async () => {
    const d = await db();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await resolveRate(d, { currency: 'USD', rate: 36.5 }, '2026-07-05')).toBe(36.5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches the fixing for the DUE DATE, not today, and layers the card fee', async () => {
    const d = await db();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ecbResponse('2026-07-05', 0.0275));
    const rate = await resolveRate(d, { currency: 'USD', rate: null }, '2026-07-05');
    expect(fetchSpy.mock.calls[0][0]).toContain('/v1/2026-07-05');
    expect(rate).toBeCloseTo((1 / 0.0275) * 1.025, 6);
  });

  it('falls back to the cached rate when the fetch fails — never blocks the ledger', async () => {
    const d = await db();
    await setFxRates(d, { USD: { thbPerUnit: 35, asOf: '2026-06-30' } });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await resolveRate(d, { currency: 'USD', rate: null }, '2026-07-05')).toBeCloseTo(
      35 * 1.025,
      6,
    );
  });

  it('falls back to the cache on a non-ok response too', async () => {
    const d = await db();
    await setFxRates(d, { USD: { thbPerUnit: 35, asOf: '2026-06-30' } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    expect(await resolveRate(d, { currency: 'USD', rate: null }, '2026-07-05')).toBeCloseTo(
      35 * 1.025,
      6,
    );
  });

  it('throws when there is neither a fetched nor a cached rate', async () => {
    const d = await db();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(resolveRate(d, { currency: 'USD', rate: null }, '2026-07-05')).rejects.toThrow(
      /USD/,
    );
  });

  it('rejects a currency the app does not know', async () => {
    const d = await db();
    await expect(resolveRate(d, { currency: 'XYZ', rate: null }, '2026-07-05')).rejects.toThrow(
      /XYZ/,
    );
  });
});

describe('convertAmount', () => {
  it('negates a plain THB rule and stores no originalAmount', async () => {
    const d = await db();
    expect(
      await convertAmount(d, { currency: 'THB', rate: null, amount: 2000 }, '2026-07-01'),
    ).toEqual({ amount: -2000, currency: 'THB', originalAmount: null });
  });

  it('treats a null currency as THB (legacy rows)', async () => {
    const d = await db();
    expect(
      await convertAmount(d, { currency: null, rate: null, amount: 2000 }, '2026-07-01'),
    ).toEqual({ amount: -2000, currency: null, originalAmount: null });
  });

  it('converts a foreign rule and stores originalAmount SIGNED, matching entry-form', async () => {
    const d = await db();
    const got = await convertAmount(d, { currency: 'USD', rate: 36.5, amount: 9.99 }, '2026-07-05');
    expect(got).toEqual({
      amount: -Math.round(9.99 * 36.5 * 100) / 100,
      currency: 'USD',
      originalAmount: -9.99,
    });
  });
});
