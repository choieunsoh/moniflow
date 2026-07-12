import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddAccount } from './AddAccount';

describe('AddAccount', () => {
  it('disables Add for a blank or duplicate name and enables for a fresh one', async () => {
    render(<AddAccount names={['Cash']} />);
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled(); // blank
    const input = screen.getByLabelText('Add account');
    await userEvent.type(input, 'Cash');
    expect(add).toBeDisabled(); // duplicate
    expect(screen.getByText('already exists')).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, 'Bank');
    expect(add).toBeEnabled();
  });

  it('treats a whitespace-trimmed collision as existing', async () => {
    render(<AddAccount names={['Cash']} />);
    const add = screen.getByRole('button', { name: 'Add' });
    await userEvent.type(screen.getByLabelText('Add account'), '  Cash  ');
    expect(add).toBeDisabled();
    expect(screen.getByText('already exists')).toBeInTheDocument();
  });

  it('stays disabled for whitespace-only input', async () => {
    render(<AddAccount names={['Cash']} />);
    const add = screen.getByRole('button', { name: 'Add' });
    await userEvent.type(screen.getByLabelText('Add account'), '   ');
    expect(add).toBeDisabled();
    expect(screen.queryByText('already exists')).toBeNull();
  });
});
