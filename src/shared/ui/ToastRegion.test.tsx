import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastRegion } from './ToastRegion';
import { toast, resetToasts } from './toast';

describe('ToastRegion', () => {
  beforeEach(() => resetToasts());

  it('renders a queued toast inside a polite live region', () => {
    render(<ToastRegion />);
    act(() => {
      toast('Saved');
    });
    const region = screen.getByText('Saved').closest('[aria-live]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  it('an error toast lands in the assertive region', () => {
    render(<ToastRegion />);
    act(() => {
      toast.error('Import failed');
    });
    const region = screen.getByText('Import failed').closest('[aria-live]');
    expect(region?.getAttribute('aria-live')).toBe('assertive');
  });

  it('the action button invokes onClick and dismisses the toast', () => {
    const onClick = vi.fn();
    render(<ToastRegion />);
    act(() => {
      toast.action('Merged into Cash', { label: 'Undo', onClick });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText('Merged into Cash')).toBeNull();
  });

  it('an error toast item carries an assertive role (alert), a normal one polite (status)', () => {
    render(<ToastRegion />);
    act(() => {
      toast('Saved');
      toast.error('Import failed');
    });
    expect(screen.getByText('Import failed').closest('[role]')?.getAttribute('role')).toBe('alert');
    expect(screen.getByText('Saved').closest('[role]')?.getAttribute('role')).toBe('status');
  });

  it('the dismiss button removes the toast', () => {
    render(<ToastRegion />);
    act(() => {
      toast('Saved');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Saved')).toBeNull();
  });
});
