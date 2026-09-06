import { describe, it, expect } from 'vitest';
import { buildShareCard } from './share-card';
import type { DonutSlice } from './donut';

const slice = (name: string, value: number, color = '#03999d'): DonutSlice => ({
  name,
  value,
  color,
  count: 1,
});

const base = {
  label: '18 Aug – 17 Sep 2026',
  grossSpend: 12000,
  count: 42,
  slices: [slice('Food', 6000), slice('Transport', 4000), slice('Coffee', 2000)],
  totalStatus: null,
  forward: null,
  now: new Date('2026-09-06T11:42:00Z'),
};

describe('buildShareCard', () => {
  it('carries the cycle label and headline', () => {
    const card = buildShareCard(base);
    expect(card.title).toBe('18 Aug – 17 Sep 2026');
    expect(card.headline).toBe('฿12,000');
  });

  it('stamps when the card was made, in Bangkok', () => {
    // 11:42 UTC is 18:42 in Bangkok — the zone every user-facing date in the app renders in, and the
    // one its cycles are reckoned in. A card read weeks later has no other way to date its figures.
    expect(buildShareCard(base).generatedAt).toBe('06/09/2026 18:42');
  });

  it('prints midnight as 00:xx, not 24:xx', () => {
    // hour12:false resolves to h24 in en-GB, which renders Bangkok midnight as "24:00" — and on the
    // PREVIOUS day's date, so the stamp would disagree with itself for one minute a day. hourCycle
    // 'h23' is what actually pins it.
    const card = buildShareCard({ ...base, now: new Date('2026-09-06T17:00:00Z') }); // 00:00 Bangkok
    expect(card.generatedAt).toBe('07/09/2026 00:00');
  });

  it('ranks rows with their share of the drawn total, not the headline', () => {
    // The headline is the signed net and still carries refunds; shares must divide by what the ring
    // actually drew or they overshoot 100% — the same trap the Home page documents.
    const card = buildShareCard({ ...base, grossSpend: 9000 });
    expect(card.rows.map((r) => [r.name, r.share])).toEqual([
      ['Food', '50%'],
      ['Transport', '33%'],
      ['Coffee', '17%'],
    ]);
  });

  it('names every wedge the ring draws, so the shares add up', () => {
    const many = Array.from({ length: 8 }, (_, i) => slice(`C${i}`, 100 - i));
    const card = buildShareCard({ ...base, slices: many });
    expect(card.rows).toHaveLength(8);
  });

  it('ranks Other by its size, not by the position toDonutSlices leaves it in', () => {
    // toDonutSlices appends the Other bucket LAST whatever it weighs, so an unsorted card put a
    // small category above a bucket three times its size — and the ring beside it disagreed.
    const withOther: DonutSlice[] = [
      slice('Food', 6000),
      slice('Coffee', 1000),
      { ...slice('Other', 3000, '#4b5061'), other: true },
    ];
    const card = buildShareCard({ ...base, slices: withOther });
    expect(card.rows.map((r) => r.name)).toEqual(['Food', 'Other', 'Coffee']);
  });

  it('shows what is left to spend TODAY, matching Home’s own card', () => {
    // Home's TodayAllowanceCard is `allowance - spentToday`; the tile states the same figure so the
    // card and the screen it came from cannot disagree.
    const card = buildShareCard({
      ...base,
      forward: { safePerDay: 440, daysLeft: 12, todayAllowance: 440, spentToday: 115 },
    });
    expect(card.kpis).toContainEqual({ label: 'Left today', value: '฿325' });
  });

  it('flips the label instead of printing a negative allowance', () => {
    // Same reason TodayAllowanceCard flips its title: "Left today −฿60" is a heading arguing with
    // its own figure.
    const card = buildShareCard({
      ...base,
      forward: { safePerDay: 440, daysLeft: 12, todayAllowance: 440, spentToday: 500 },
    });
    expect(card.kpis).toContainEqual({ label: 'Over today by', value: '฿60' });
  });

  it('counts the days left in the cycle', () => {
    const card = buildShareCard({
      ...base,
      forward: { safePerDay: 440, daysLeft: 12, todayAllowance: 440, spentToday: 0 },
    });
    expect(card.kpis).toContainEqual({ label: 'Days left', value: '12' });
  });

  it('has no forward tiles at all on a past cycle', () => {
    // daysLeft, tomorrow and today's allowance are all statements about a cycle still running.
    const labels = buildShareCard(base).kpis.map((k) => k.label);
    expect(labels).not.toContain('Days left');
    expect(labels).not.toContain('Left today');
    expect(labels).not.toContain('Tomorrow');
  });

  it('always offers at least two KPIs and never more than four', () => {
    const bare = buildShareCard(base);
    expect(bare.kpis).toHaveLength(2);
    expect(bare.kpis.map((k) => k.label)).toEqual(['Transactions', 'Categories']);

    const full = buildShareCard({
      ...base,
      totalStatus: { limit: 20000, spent: 12000, pct: 60, remaining: 8000, state: 'under' },
      forward: { safePerDay: 500, daysLeft: 16, todayAllowance: 500, spentToday: 0 },
    });
    expect(full.kpis).toHaveLength(4);
    // The counts fall off the end of a cycle that has every forward figure.
    expect(full.kpis.map((k) => k.label)).toEqual([
      'Left of budget',
      'Left today',
      'Tomorrow',
      'Days left',
    ]);
  });

  it('leads with the budget remainder when a budget exists', () => {
    const card = buildShareCard({
      ...base,
      totalStatus: { limit: 20000, spent: 12000, pct: 60, remaining: 8000, state: 'under' },
    });
    expect(card.kpis[0]).toEqual({ label: 'Left of budget', value: '฿8,000' });
  });

  it('states an overspend as an overspend rather than a negative remainder', () => {
    // formatBahtWhole(-3000) renders "-฿3,000" — a minus sign next to "Left of budget" reads as a
    // typo, not as being over. Name the state instead.
    const card = buildShareCard({
      ...base,
      totalStatus: { limit: 9000, spent: 12000, pct: 100, remaining: -3000, state: 'over' },
    });
    expect(card.kpis[0]).toEqual({ label: 'Over budget by', value: '฿3,000' });
  });

  it('carries tomorrow’s allowance, rescaled off the same helper the Home card uses', () => {
    const card = buildShareCard({
      ...base,
      forward: { safePerDay: 440, daysLeft: 12, todayAllowance: 440, spentToday: 0 },
    });
    expect(card.kpis).toContainEqual({ label: 'Tomorrow', value: '฿480' });
  });

  it('has no Tomorrow tile on the cycle last day', () => {
    const card = buildShareCard({
      ...base,
      forward: { safePerDay: 440, daysLeft: 1, todayAllowance: 440, spentToday: 0 },
    });
    expect(card.kpis.map((k) => k.label)).not.toContain('Tomorrow');
  });

  it('drops the allowance tiles when there is no budget to divide, but keeps the days', () => {
    const card = buildShareCard({
      ...base,
      forward: { safePerDay: null, daysLeft: 16, todayAllowance: null, spentToday: 0 },
    });
    const labels = card.kpis.map((k) => k.label);
    expect(labels).not.toContain('Left today');
    expect(labels).not.toContain('Tomorrow');
    expect(labels).toContain('Days left'); // the cycle is still running, budget or not
  });

  it('survives an empty cycle without dividing by zero', () => {
    const card = buildShareCard({ ...base, grossSpend: 0, count: 0, slices: [] });
    expect(card.headline).toBe('฿0');
    expect(card.rows).toEqual([]);
  });
});
