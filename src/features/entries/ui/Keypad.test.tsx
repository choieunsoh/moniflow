import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Keypad } from './Keypad';
import type { EntryRow } from '../schema';
import type { NoteSuggestionRow } from '../queries';

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

const someEntry: EntryRow = {
  id: 42,
  date: '2026-08-14',
  time: '08:15',
  accountId: 1,
  categoryId: 1,
  amount: -10,
  currency: 'THB',
  originalAmount: null,
  note: 'ทิป grab food',
  source: 'manual',
  offBudget: null,
  category: 'Grab Food',
  account: 'Cash',
};

function renderWith(props: Partial<React.ComponentProps<typeof Keypad>>) {
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
      today="2026-09-09"
      iconSet="emoji"
      keypadLayout="calc"
      action={async () => {}}
      offBudgetCategories={new Set()}
      travelCurrencies={new Set()}
      {...props}
    />,
  );
}

// The same ฿10 tip is keyed several times a week. Duplicate is a LABELLED control on the edit
// screen, deliberately not a second swipe: the row already hides Delete behind a leftward swipe, and
// a second invisible gesture in the opposite direction on a destructive neighbour is how you press
// the wrong one.
describe('Keypad duplicate', () => {
  it('offers Duplicate on an existing entry, pointing at a pre-filled new entry', () => {
    renderWith({ entry: someEntry });
    expect(screen.getByRole('link', { name: /Duplicate/i })).toHaveAttribute(
      'href',
      '/entries/new?copy=42',
    );
  });

  it('offers no Duplicate on a blank new entry', () => {
    renderWith({});
    expect(screen.queryByRole('link', { name: /Duplicate/i })).toBeNull();
  });

  // On the copy screen the form must post a NEW row, not an edit of the row it came from, so the
  // id (which is what tells editEntryAction which row to overwrite) must not ride along.
  it('posts no id while duplicating, and does not offer to duplicate the duplicate', () => {
    const { container } = renderWith({ entry: someEntry, isCopy: true });
    expect(container.querySelector('input[name="id"]')).toBeNull();
    expect(screen.queryByRole('link', { name: /Duplicate/i })).toBeNull();
  });
});

// The keypad is the one screen used standing at a counter, one-handed, without looking closely. A
// short pulse is what tells a thumb the key registered.
describe('Keypad haptics', () => {
  function stubVibrate() {
    const spy = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: spy, configurable: true, writable: true });
    return spy;
  }
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'vibrate');
  });

  it('pulses on a digit key', () => {
    const spy = stubVibrate();
    renderWith({});
    fireEvent.click(screen.getByRole('button', { name: '7' }));
    expect(spy).toHaveBeenCalled();
  });

  it('pulses when a category tile saves the entry', () => {
    const spy = stubVibrate();
    renderWith({ categories: [{ name: 'Food', emoji: '🍜' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Food' }));
    expect(spy).toHaveBeenCalled();
  });
});

// The chip offers the category/account a note has always taken, so a repeat purchase saves in one
// tap. Only ever offered on a brand-new entry — an edit or a duplicate already carries its own
// category, and a second competing answer on the same screen would be noise.
describe('the note suggestion chip', () => {
  const SUGGESTIONS: NoteSuggestionRow[] = [
    { note: 'ข้าวเที่ยง', category: 'อาหาร', account: 'บัตรเครดิต', count: 9, last: '2026-08-01' },
  ];
  const NOTE_CATEGORIES = [
    { name: 'อาหาร', emoji: '🍜' },
    { name: 'กาแฟ', emoji: '☕' },
  ];
  const NOTE_ACCOUNTS = [
    { name: 'เงินสด', icon: '💵' },
    { name: 'บัตรเครดิต', icon: '💳' },
  ];

  async function keyAmount(digits: string) {
    for (const digit of digits) {
      await userEvent.click(screen.getByRole('button', { name: digit }));
    }
  }

  // Views toggle via a CSS `hidden` class, not real unmount (see Keypad.tsx) — jsdom has no
  // stylesheet loaded, so a hidden view's category grid tile stays in the accessible tree. A bare
  // /อาหาร/ match would therefore also hit the ordinary "อาหาร" grid tile whenever that category is
  // in the picker's list, which the chip requires. Matching the chip's own "category · account"
  // text is what makes these assertions target the chip and nothing else.

  it('is absent before a matching note is typed', async () => {
    renderWith({ noteSuggestions: SUGGESTIONS, categories: NOTE_CATEGORIES });
    await keyAmount('100');
    expect(screen.queryByRole('button', { name: /อาหาร · บัตรเครดิต/ })).toBeNull();
  });

  it('appears once the note matches and an amount is keyed', async () => {
    renderWith({ noteSuggestions: SUGGESTIONS, categories: NOTE_CATEGORIES });
    await keyAmount('100');
    await userEvent.type(screen.getByPlaceholderText('Note (optional)'), 'ข้าวเที่ยง');
    expect(screen.getByRole('button', { name: /อาหาร · บัตรเครดิต/ })).toBeVisible();
  });

  it('stays absent at a zero amount', async () => {
    renderWith({ noteSuggestions: SUGGESTIONS, categories: NOTE_CATEGORIES });
    await userEvent.type(screen.getByPlaceholderText('Note (optional)'), 'ข้าวเที่ยง');
    expect(screen.queryByRole('button', { name: /อาหาร · บัตรเครดิต/ })).toBeNull();
  });

  it('stays absent when duplicating an existing row', async () => {
    const copiedEntry: EntryRow = { ...someEntry, note: 'ข้าวเที่ยง' };
    renderWith({
      noteSuggestions: SUGGESTIONS,
      categories: NOTE_CATEGORIES,
      entry: copiedEntry,
      isCopy: true,
    });
    await keyAmount('100');
    expect(screen.queryByRole('button', { name: /อาหาร · บัตรเครดิต/ })).toBeNull();
  });

  it('submits the suggested category and account', async () => {
    const action = vi.fn<(formData: FormData) => Promise<void>>();
    renderWith({
      noteSuggestions: SUGGESTIONS,
      categories: NOTE_CATEGORIES,
      accounts: NOTE_ACCOUNTS,
      action,
      defaultAccount: 'เงินสด',
    });
    await keyAmount('100');
    await userEvent.type(screen.getByPlaceholderText('Note (optional)'), 'ข้าวเที่ยง');
    await userEvent.click(screen.getByRole('button', { name: /อาหาร · บัตรเครดิต/ }));

    const [form] = action.mock.calls[0];
    expect(form.get('category')).toBe('อาหาร');
    expect(form.get('account')).toBe('บัตรเครดิต');
  });

  it('an account you picked yourself beats the suggestion', async () => {
    const action = vi.fn<(formData: FormData) => Promise<void>>();
    renderWith({
      noteSuggestions: SUGGESTIONS,
      categories: NOTE_CATEGORIES,
      accounts: NOTE_ACCOUNTS,
      action,
      defaultAccount: 'เงินสด',
    });
    await keyAmount('100');
    await userEvent.type(screen.getByPlaceholderText('Note (optional)'), 'ข้าวเที่ยง');
    await userEvent.click(screen.getByRole('button', { name: /^Account:/ }));
    await userEvent.click(screen.getByRole('button', { name: 'เงินสด' }));
    await userEvent.click(screen.getByRole('button', { name: /อาหาร · บัตรเครดิต/ }));

    const [form] = action.mock.calls[0];
    expect(form.get('account')).toBe('เงินสด');
  });

  it('falls back to the default account when no note matches', async () => {
    const action = vi.fn<(formData: FormData) => Promise<void>>();
    renderWith({
      noteSuggestions: SUGGESTIONS,
      categories: NOTE_CATEGORIES,
      accounts: NOTE_ACCOUNTS,
      action,
      defaultAccount: 'เงินสด',
    });
    await keyAmount('100');
    await userEvent.click(screen.getByRole('button', { name: 'Choose category' }));
    await userEvent.click(screen.getByRole('button', { name: /กาแฟ/ }));

    const [form] = action.mock.calls[0];
    expect(form.get('account')).toBe('เงินสด');
  });
});
