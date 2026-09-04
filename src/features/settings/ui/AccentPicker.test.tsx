import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACCENTS, ACCENT_STORAGE_KEY } from '../theme';

vi.mock('../actions', () => ({ setAccentAction: vi.fn().mockResolvedValue(undefined) }));

import { setAccentAction } from '../actions';
import { AccentPicker } from './AccentPicker';

describe('AccentPicker', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.accent;
    localStorage.clear();
    vi.mocked(setAccentAction).mockClear();
  });

  it('offers every palette, ink first', () => {
    render(<AccentPicker />);
    expect(screen.getAllByRole('radio')).toHaveLength(ACCENTS.length);
    expect(screen.getByRole('radio', { name: /ink/i })).toBeInTheDocument();
  });

  it('stamps each swatch with its OWN palette, so a swatch previews what it offers', () => {
    render(<AccentPicker />);
    // The bug this guards against: with the swatch unstamped, every dot inherits :root and paints
    // the CURRENTLY selected accent instead of the one it is offering.
    expect(screen.getByRole('radio', { name: /teal/i })).toHaveAttribute('data-accent', 'teal');
    expect(screen.getByRole('radio', { name: /ink/i })).toHaveAttribute('data-accent', 'ink');
  });

  it('starts on the stored palette and marks it beyond colour alone', async () => {
    localStorage.setItem(ACCENT_STORAGE_KEY, 'plum');
    render(<AccentPicker />);
    const plum = await screen.findByRole('radio', { name: /plum/i });
    expect(plum).toHaveAttribute('aria-checked', 'true');
  });

  it('stamps <html> on click, and removes the attribute for ink', async () => {
    render(<AccentPicker />);
    await userEvent.click(screen.getByRole('radio', { name: /azure/i }));
    expect(document.documentElement.dataset.accent).toBe('azure');
    expect(setAccentAction).toHaveBeenCalledWith('azure');

    await userEvent.click(screen.getByRole('radio', { name: /ink/i }));
    expect(document.documentElement.dataset.accent).toBeUndefined();
  });
});
