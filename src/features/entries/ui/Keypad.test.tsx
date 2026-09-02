import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Keypad } from './Keypad';
import type { EntryRow } from '../schema';

// CloseButton (rendered unconditionally on the keypad view) calls useRouter().back() — mock it the
// same way SearchBox.test.tsx mocks next/navigation, since there is no real router in this render.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

// Minimal, valid prop set for the add-entry route (no `entry` — the edit path, where `entry` is
// passed, is covered separately below by the toggle-initialisation tests). `action` is a no-op stub:
// the keypad's own submit wiring isn't under test, only the refund toggle's effect on the two outputs
// that carry it — the hidden `direction` field and the signed amount display.
function renderKeypad() {
  return render(
    <Keypad
      categories={[]}
      accounts={[]}
      currencies={[{ code: 'THB', symbol: '฿' }]}
      currencyCodes={new Set(['THB'])}
      notes={[]}
      rates={{}}
      ratesAsOf={{}}
      defaultAccount="Cash"
      today="2026-08-14"
      iconSet="emoji"
      keypadLayout="calc"
      action={async () => {}}
      offBudgetCategories={new Set()}
      travelCurrencies={new Set()}
    />,
  );
}

describe('Keypad refund toggle', () => {
  it('tracks the toggle in the hidden direction field: expense off, income on', () => {
    const { container } = renderKeypad();
    const direction = container.querySelector<HTMLInputElement>('input[name="direction"]');
    if (direction === null) throw new Error('direction field not found');
    expect(direction.value).toBe('expense');

    fireEvent.click(screen.getByRole('checkbox', { name: /^Refund/ }));
    expect(direction.value).toBe('income');

    fireEvent.click(screen.getByRole('checkbox', { name: /^Refund/ }));
    expect(direction.value).toBe('expense');
  });

  it('signs the amount display with a leading + only while the toggle is on', () => {
    const { container } = renderKeypad();
    const amountSpan = container.querySelector('.text-4xl');
    if (amountSpan === null) throw new Error('amount display not found');
    expect(amountSpan.textContent?.startsWith('+')).toBe(false);

    fireEvent.click(screen.getByRole('checkbox', { name: /^Refund/ }));
    expect(amountSpan.textContent?.startsWith('+')).toBe(true);
  });

  it('initialises toggle from existing refund: positive amount starts checked, direction is income', () => {
    const refundEntry: EntryRow = {
      id: 1,
      date: '2026-08-14',
      time: null,
      accountId: 1,
      categoryId: 1,
      amount: 500,
      currency: 'THB',
      originalAmount: null,
      note: null,
      source: 'manual',
      offBudget: null,
      category: 'Food',
      account: 'Cash',
    };

    const { container } = render(
      <Keypad
        categories={[]}
        accounts={[]}
        currencies={[{ code: 'THB', symbol: '฿' }]}
        currencyCodes={new Set(['THB'])}
        notes={[]}
        rates={{}}
        ratesAsOf={{}}
        defaultAccount="Cash"
        today="2026-08-14"
        iconSet="emoji"
        keypadLayout="calc"
        action={async () => {}}
        offBudgetCategories={new Set()}
        travelCurrencies={new Set()}
        entry={refundEntry}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: /^Refund/ });
    expect(checkbox).toBeChecked();

    const direction = container.querySelector<HTMLInputElement>('input[name="direction"]');
    if (direction === null) throw new Error('direction field not found');
    expect(direction.value).toBe('income');
  });

  it('initialises toggle from existing expense: negative amount starts unchecked, direction is expense', () => {
    const expenseEntry: EntryRow = {
      id: 2,
      date: '2026-08-14',
      time: null,
      accountId: 1,
      categoryId: 1,
      amount: -500,
      currency: 'THB',
      originalAmount: null,
      note: null,
      source: 'manual',
      offBudget: null,
      category: 'Food',
      account: 'Cash',
    };

    const { container } = render(
      <Keypad
        categories={[]}
        accounts={[]}
        currencies={[{ code: 'THB', symbol: '฿' }]}
        currencyCodes={new Set(['THB'])}
        notes={[]}
        rates={{}}
        ratesAsOf={{}}
        defaultAccount="Cash"
        today="2026-08-14"
        iconSet="emoji"
        keypadLayout="calc"
        action={async () => {}}
        offBudgetCategories={new Set()}
        travelCurrencies={new Set()}
        entry={expenseEntry}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: /^Refund/ });
    expect(checkbox).not.toBeChecked();

    const direction = container.querySelector<HTMLInputElement>('input[name="direction"]');
    if (direction === null) throw new Error('direction field not found');
    expect(direction.value).toBe('expense');
  });
});
