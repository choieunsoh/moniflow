import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
    document.documentElement.dataset.theme = 'dark';
    render(<ThemePicker />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(await screen.findByRole('button', { name: /dark/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  // The same regression AccentPicker guards against, and it needs its own test rather than trusting
  // that the two components stay identical. Saving bumps the data version, useSettings drops `ready`
  // while it refetches, and the Settings page renders a placeholder — so every pick REMOUNTS this
  // component. Reading a localStorage cache lost that race; reading the attribute cannot.
  //
  // Note the default is the interesting case here, and it is the one AccentPicker's test cannot
  // cover: "system" is an ABSENT attribute, so a remount has to read absence as a value rather than
  // as missing data.
  it('survives the remount that every pick causes, including for the absent default', async () => {
    const first = render(<ThemePicker />);
    await userEvent.click(screen.getByRole('button', { name: /light/i }));
    expect(document.documentElement.dataset.theme).toBe('light');
    first.unmount();

    const second = render(<ThemePicker />);
    expect(await screen.findByRole('button', { name: /light/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: /system/i }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    second.unmount();

    render(<ThemePicker />);
    expect(await screen.findByRole('button', { name: /system/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('stamps <html> on click without waiting for the write to come back', async () => {
    render(<ThemePicker />);
    await userEvent.click(screen.getByRole('button', { name: /light/i }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(setThemeAction).toHaveBeenCalledWith('light');
  });

  it('removes the attribute for "system", leaving color-scheme to follow the OS', async () => {
    render(<ThemePicker />);
    await userEvent.click(screen.getByRole('button', { name: /dark/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');

    await userEvent.click(screen.getByRole('button', { name: /system/i }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
