import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACCENTS } from '../theme';

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
    expect(screen.getAllByRole('button')).toHaveLength(ACCENTS.length);
    expect(screen.getByRole('button', { name: /ink/i })).toBeInTheDocument();
  });

  it('stamps each swatch with its OWN palette, so a swatch previews what it offers', () => {
    render(<AccentPicker />);
    // The bug this guards against: with the swatch unstamped, every dot inherits :root and paints
    // the CURRENTLY selected accent instead of the one it is offering.
    expect(screen.getByRole('button', { name: /teal/i })).toHaveAttribute('data-accent', 'teal');
    expect(screen.getByRole('button', { name: /ink/i })).toHaveAttribute('data-accent', 'ink');
  });

  it('starts on the applied palette and marks it beyond colour alone', async () => {
    document.documentElement.dataset.accent = 'plum';
    render(<AccentPicker />);
    const plum = await screen.findByRole('button', { name: /plum/i });
    expect(plum).toHaveAttribute('aria-pressed', 'true');
  });

  // Regression: the browser pass found the picker snapping back to Ink after a pick. Saving bumps
  // the data version, useSettings drops `ready`, and the Settings page swaps in a placeholder — so
  // every pick REMOUNTS this component. Reading the localStorage cache lost that race (the cache is
  // written asynchronously by useTheme); reading the attribute cannot, because it is what the app is
  // already wearing. A remount must never contradict the screen.
  it('survives the remount that every pick causes', async () => {
    const first = render(<AccentPicker />);
    await userEvent.click(screen.getByRole('button', { name: /teal/i }));
    expect(document.documentElement.dataset.accent).toBe('teal');
    first.unmount();

    render(<AccentPicker />);
    const teal = await screen.findByRole('button', { name: /teal/i });
    expect(teal).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /ink/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('stamps <html> on click, and removes the attribute for ink', async () => {
    render(<AccentPicker />);
    await userEvent.click(screen.getByRole('button', { name: /azure/i }));
    expect(document.documentElement.dataset.accent).toBe('azure');
    expect(setAccentAction).toHaveBeenCalledWith('azure');

    await userEvent.click(screen.getByRole('button', { name: /ink/i }));
    expect(document.documentElement.dataset.accent).toBeUndefined();
  });
});
