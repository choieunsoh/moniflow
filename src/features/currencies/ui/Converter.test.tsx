import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { FxRates } from '@features/settings/queries';
import { Converter, type ConverterProps } from './Converter';

const rates: FxRates = {
  JPY: { thbPerUnit: 0.22, asOf: '2026-10-02' },
  USD: { thbPerUnit: 33, asOf: '2026-10-03' },
};

function setup(overrides: Partial<ConverterProps> = {}) {
  const props: ConverterProps = {
    codes: ['THB', 'JPY', 'USD', 'KRW'],
    rates,
    cardFeePct: 2.5,
    from: 'JPY',
    to: 'THB',
    amount: '1000',
    onAmount: vi.fn(),
    onPair: vi.fn(),
    onRefresh: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  render(<Converter {...props} />);
  return props;
}

function bodyRows(): HTMLTableRowElement[] {
  return [...document.querySelectorAll('tbody tr')].filter(
    (r): r is HTMLTableRowElement => r instanceof HTMLTableRowElement,
  );
}

describe('Converter', () => {
  it('shows four fee rows with per-unit and total figures', () => {
    setup();
    const rows = bodyRows();
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain('+0%');
    expect(rows[0].textContent).toContain('฿0.2200');
    expect(rows[0].textContent).toContain('฿220.00');
    expect(rows[3].textContent).toContain('+2.5%');
    expect(rows[3].textContent).toContain('฿225.50');
  });

  it('stars the row matching the card fee, and none when nothing matches', () => {
    setup();
    expect(bodyRows()[3].querySelector('[aria-label="your card fee"]')).not.toBeNull();
    cleanup();
    setup({ cardFeePct: 1.5 });
    expect(document.querySelector('[aria-label="your card fee"]')).toBeNull();
  });

  it('shows a single mid-rate row for a cross pair', () => {
    setup({ from: 'USD', to: 'JPY' });
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText(/card fees apply in baht/i)).toBeTruthy();
  });

  it('hides the total column without a valid amount', () => {
    setup({ amount: '' });
    expect(bodyRows()[0].querySelectorAll('td')).toHaveLength(2);
  });

  it('swaps the pair', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /swap/i }));
    expect(props.onPair).toHaveBeenCalledWith('THB', 'JPY');
  });

  it('says a rate is missing instead of printing numbers', () => {
    setup({ from: 'KRW' });
    expect(screen.getByText('No rate for KRW yet')).toBeTruthy();
    expect(bodyRows()).toHaveLength(0);
  });

  it('wraps every figure cell in .money for privacy blur', () => {
    setup();
    const rows = bodyRows();
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      for (const cell of [...row.querySelectorAll('td')].slice(1)) {
        expect(cell.querySelector('span.money')).not.toBeNull();
      }
    }
    const amountHeader = [...document.querySelectorAll('thead th')][2];
    expect(amountHeader?.querySelector('span.money')).not.toBeNull();
  });
});
