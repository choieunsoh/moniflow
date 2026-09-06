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
};

describe('buildShareCard', () => {
  it('carries the cycle label and headline', () => {
    const card = buildShareCard(base);
    expect(card.title).toBe('18 Aug – 17 Sep 2026');
    expect(card.headline).toBe('฿12,000');
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

  it('always offers at least two KPIs and never more than three', () => {
    const bare = buildShareCard(base);
    expect(bare.kpis).toHaveLength(2);
    expect(bare.kpis.map((k) => k.label)).toEqual(['Transactions', 'Categories']);

    const full = buildShareCard({
      ...base,
      totalStatus: { limit: 20000, spent: 12000, pct: 60, remaining: 8000, state: 'under' },
      forward: { safePerDay: 500, daysLeft: 16 },
    });
    expect(full.kpis).toHaveLength(3);
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

  it('drops the per-day KPI when there is no budget to divide', () => {
    const card = buildShareCard({ ...base, forward: { safePerDay: null, daysLeft: 16 } });
    expect(card.kpis.map((k) => k.label)).not.toContain('Left per day');
  });

  it('survives an empty cycle without dividing by zero', () => {
    const card = buildShareCard({ ...base, grossSpend: 0, count: 0, slices: [] });
    expect(card.headline).toBe('฿0');
    expect(card.rows).toEqual([]);
  });
});
