import { describe, it, expect } from 'vitest';
import { pickNoteSuggestion } from './note-suggest';
import type { NoteSuggestionRow } from './queries';

function row(over: Partial<NoteSuggestionRow> = {}): NoteSuggestionRow {
  return {
    note: 'ข้าวเที่ยง',
    category: 'อาหาร',
    account: 'เงินสด',
    count: 1,
    last: '2026-01-01',
    ...over,
  };
}

describe('pickNoteSuggestion', () => {
  it('returns null for an empty note', () => {
    expect(pickNoteSuggestion([row()], '')).toBeNull();
    expect(pickNoteSuggestion([row()], '   ')).toBeNull();
  });

  it('returns null when no stored note matches', () => {
    expect(pickNoteSuggestion([row()], 'กาแฟ')).toBeNull();
  });

  it('matches exactly, not by prefix or substring', () => {
    expect(pickNoteSuggestion([row({ note: 'ข้าวเที่ยงวันศุกร์' })], 'ข้าวเที่ยง')).toBeNull();
    expect(pickNoteSuggestion([row({ note: 'ข้าว' })], 'ข้าวเที่ยง')).toBeNull();
  });

  it('folds case and surrounding whitespace on both sides', () => {
    const found = pickNoteSuggestion([row({ note: '  Starbucks ' })], 'starbucks');
    expect(found).toEqual({ category: 'อาหาร', account: 'เงินสด' });
  });

  it('picks the most frequent combination', () => {
    const rows = [
      row({ category: 'อาหาร', count: 9 }),
      row({ category: 'ช็อปปิ้ง', count: 40 }),
      row({ category: 'กาแฟ', count: 2 }),
    ];
    expect(pickNoteSuggestion(rows, 'ข้าวเที่ยง')?.category).toBe('ช็อปปิ้ง');
  });

  it('breaks a tie on the more recent combination', () => {
    const rows = [
      row({ category: 'อาหาร', count: 5, last: '2024-03-01' }),
      row({ category: 'กาแฟ', count: 5, last: '2026-08-30' }),
    ];
    expect(pickNoteSuggestion(rows, 'ข้าวเที่ยง')?.category).toBe('กาแฟ');
  });

  it('carries the account of the winning combination, not of another row', () => {
    const rows = [
      row({ category: 'อาหาร', account: 'เงินสด', count: 1 }),
      row({ category: 'กาแฟ', account: 'บัตรเครดิต', count: 7 }),
    ];
    expect(pickNoteSuggestion(rows, 'ข้าวเที่ยง')).toEqual({
      category: 'กาแฟ',
      account: 'บัตรเครดิต',
    });
  });

  it('ignores rows for other notes entirely', () => {
    const rows = [row({ note: 'กาแฟ', category: 'กาแฟ', count: 99 }), row({ count: 1 })];
    expect(pickNoteSuggestion(rows, 'ข้าวเที่ยง')?.category).toBe('อาหาร');
  });
});
