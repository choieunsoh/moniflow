import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../actions', () => ({ setPrivacyAction: vi.fn().mockResolvedValue(undefined) }));

import { setPrivacyAction } from '../actions';
import { PrivacyToggle } from './PrivacyToggle';

describe('PrivacyToggle', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.privacy;
    localStorage.clear();
    vi.mocked(setPrivacyAction).mockClear();
  });

  it('offers the two states and starts on the stored one', async () => {
    document.documentElement.dataset.privacy = 'on';
    render(<PrivacyToggle />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(await screen.findByRole('button', { name: /^on$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  // Same regression ThemePicker guards against: saving bumps the data version, useSettings drops
  // `ready`, the Settings page swaps in a placeholder, and every pick REMOUNTS this component. Only
  // the attribute survives that — a localStorage read would lose the race.
  it('survives the remount that every pick causes, including for the absent default', async () => {
    const first = render(<PrivacyToggle />);
    await userEvent.click(screen.getByRole('button', { name: /^on$/i }));
    expect(document.documentElement.dataset.privacy).toBe('on');
    first.unmount();

    const second = render(<PrivacyToggle />);
    expect(await screen.findByRole('button', { name: /^on$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: /^off$/i }));
    expect(document.documentElement.dataset.privacy).toBeUndefined();
    second.unmount();

    render(<PrivacyToggle />);
    expect(await screen.findByRole('button', { name: /^off$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('stamps <html> on click without waiting for the write to come back', async () => {
    render(<PrivacyToggle />);
    await userEvent.click(screen.getByRole('button', { name: /^on$/i }));
    expect(document.documentElement.dataset.privacy).toBe('on');
    expect(setPrivacyAction).toHaveBeenCalledWith('on');
  });

  it('removes the attribute for "off", the default', async () => {
    render(<PrivacyToggle />);
    await userEvent.click(screen.getByRole('button', { name: /^on$/i }));
    expect(document.documentElement.dataset.privacy).toBe('on');

    await userEvent.click(screen.getByRole('button', { name: /^off$/i }));
    expect(document.documentElement.dataset.privacy).toBeUndefined();
  });
});
