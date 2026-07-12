import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddCategory } from './AddCategory';

function typeName(value: string) {
  render(<AddCategory names={['Food', 'Coffee']} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value } });
}

describe('AddCategory', () => {
  it('disables Add until a name is entered', () => {
    render(<AddCategory names={['Food']} />);
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
  });

  it('enables Add for a new, non-empty name', () => {
    typeName('Snacks');
    expect(screen.getByRole('button', { name: /add/i })).toBeEnabled();
    expect(screen.queryByText(/already exists/i)).toBeNull();
  });

  it('blocks and warns when the name already exists', () => {
    typeName('Coffee');
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
    expect(screen.getByText(/already exists/i)).toBeTruthy();
  });

  it('treats a whitespace-trimmed collision as existing', () => {
    typeName('  Food  ');
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
  });

  it('stays disabled for whitespace-only input', () => {
    typeName('   ');
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
    expect(screen.queryByText(/already exists/i)).toBeNull();
  });
});
