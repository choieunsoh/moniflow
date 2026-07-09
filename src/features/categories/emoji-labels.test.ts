import { describe, it, expect } from 'vitest';
import { EMOJI_CHOICES, EMOJI_LABELS } from './queries';

describe('EMOJI_LABELS', () => {
  it('has a label for every picker choice', () => {
    const missing = EMOJI_CHOICES.filter((emoji) => !EMOJI_LABELS[emoji]);
    expect(missing).toEqual([]);
  });
});
