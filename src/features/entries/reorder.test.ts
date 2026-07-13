import { describe, it, expect } from 'vitest';
import { reorderByIds } from './reorder';

const id = (x: { name: string }) => x.name;
const items = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }];

describe('reorderByIds', () => {
  it('moves an item forward', () => {
    expect(reorderByIds(items, id, 'A', 'C').map(id)).toEqual(['B', 'C', 'A', 'D']);
  });
  it('moves an item backward', () => {
    expect(reorderByIds(items, id, 'D', 'B').map(id)).toEqual(['A', 'D', 'B', 'C']);
  });
  it('returns the same reference when active and over are the same', () => {
    expect(reorderByIds(items, id, 'B', 'B')).toBe(items);
  });
  it('returns the same reference when an id is unknown', () => {
    expect(reorderByIds(items, id, 'A', 'Z')).toBe(items);
  });
});
