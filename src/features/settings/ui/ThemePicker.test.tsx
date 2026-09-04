import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { THEME_STORAGE_KEY } from '../theme';

vi.mock('../actions', () => ({ setThemeAction: vi.fn().mockResolvedValue(undefined) }));

import { setThemeAction } from '../actions';
import { ThemePicker } from './ThemePicker';

describe('ThemePicker', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
    localStorage.clear();
    vi.mocked(setThemeAction).mockClear();
  });

  it('offers the three states and starts on the stored one', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(<ThemePicker />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(await screen.findByRole('radio', { name: /dark/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('stamps <html> on click without waiting for the write to come back', async () => {
    render(<ThemePicker />);
    await userEvent.click(screen.getByRole('radio', { name: /light/i }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(setThemeAction).toHaveBeenCalledWith('light');
  });

  it('removes the attribute for "system", leaving color-scheme to follow the OS', async () => {
    render(<ThemePicker />);
    await userEvent.click(screen.getByRole('radio', { name: /dark/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');

    await userEvent.click(screen.getByRole('radio', { name: /system/i }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
