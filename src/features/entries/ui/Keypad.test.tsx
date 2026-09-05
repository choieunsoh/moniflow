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

// The chip row holds four controls in ~339px on a 390px phone, and the account chip is the only one
// that may shrink — so it absorbed every pixel of the shortfall and rendered "KTC X VISA" as "KT…".
// The width that bought back is the currency chip's, which was spending it on saying one thing twice.
describe('Keypad currency chip', () => {
  it('shows the bare symbol for the home currency, where the code repeats it', () => {
    renderKeypad();
    const chip = screen.getByRole('button', { name: 'Currency: THB' });
    expect(chip.textContent).toContain('฿');
    // "฿ THB" is the symbol and its own name side by side. The chip is inactive in this state and
    // it is the state nearly every entry is keyed in, so this is the row's cheapest 36px.
    expect(chip.textContent).not.toContain('THB');
  });

  it('keeps the code for a foreign currency, where the symbol alone is not the point', () => {
    render(
      <Keypad
        categories={[]}
        accounts={[]}
        currencies={[
          { code: 'THB', symbol: '฿' },
          { code: 'JPY', symbol: '¥' },
        ]}
        currencyCodes={new Set(['THB', 'JPY'])}
        notes={[]}
        rates={{ JPY: 0.24 }}
        ratesAsOf={{}}
        defaultAccount="Cash"
        today="2026-08-14"
        iconSet="emoji"
        keypadLayout="calc"
        action={async () => {}}
        offBudgetCategories={new Set()}
        travelCurrencies={new Set()}
        entry={{
          id: 7,
          date: '2026-08-14',
          time: null,
          accountId: 1,
          categoryId: 1,
          amount: -240,
          currency: 'JPY',
          originalAmount: -1000,
          note: null,
          // NOT null: `source` is notNull with a 'manual' default, so $inferSelect types it string.
          source: 'manual',
          offBudget: null,
          category: 'Food',
          account: 'Cash',
        }}
      />,
    );
    const chip = screen.getByRole('button', { name: 'Currency: JPY' });
    expect(chip.textContent).toContain('JPY');
  });
});
