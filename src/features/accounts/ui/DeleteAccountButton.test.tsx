import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteAccountButton } from './DeleteAccountButton';

describe('DeleteAccountButton', () => {
  it('arms on first tap (label changes to Delete) before committing', async () => {
    render(<DeleteAccountButton account="Empty" />);
    const btn = screen.getByRole('button', { name: 'Delete Empty' });
    await userEvent.click(btn);
    expect(screen.getByRole('button', { name: 'Confirm delete Empty' })).toBeInTheDocument();
  });
});
