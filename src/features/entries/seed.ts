import type { Db } from '@db/client';
import { entries, type NewEntry } from './schema';
import { addEntries } from './queries';

// A realistic ~3 weeks of personal money flow (THB), signed: + inflow, − outflow. Enough shape
// for the balance chart to tell a story and the ledger to feel real. Replace with your own.
const DEMO: NewEntry[] = [
  { date: '2026-07-01', account: 'bank', category: 'salary', amount: 62000, note: 'July payroll' },
  { date: '2026-07-01', account: 'bank', category: 'rent', amount: -18000, note: null },
  { date: '2026-07-02', account: 'cash', category: 'groceries', amount: -1450, note: null },
  {
    date: '2026-07-03',
    account: 'bank',
    category: 'utilities',
    amount: -2200,
    note: 'electric + water',
  },
  { date: '2026-07-04', account: 'cash', category: 'transport', amount: -600, note: null },
  { date: '2026-07-05', account: 'cash', category: 'dining', amount: -980, note: null },
  {
    date: '2026-07-07',
    account: 'bank',
    category: 'freelance',
    amount: 15000,
    note: 'side project',
  },
  { date: '2026-07-08', account: 'cash', category: 'groceries', amount: -1720, note: null },
  {
    date: '2026-07-10',
    account: 'bank',
    category: 'subscriptions',
    amount: -890,
    note: 'streaming + cloud',
  },
  { date: '2026-07-12', account: 'cash', category: 'dining', amount: -1340, note: 'dinner out' },
  { date: '2026-07-14', account: 'bank', category: 'health', amount: -2500, note: 'dentist' },
  { date: '2026-07-15', account: 'cash', category: 'transport', amount: -720, note: null },
  { date: '2026-07-17', account: 'bank', category: 'shopping', amount: -3400, note: 'new shoes' },
  { date: '2026-07-19', account: 'cash', category: 'groceries', amount: -1610, note: null },
  { date: '2026-07-20', account: 'bank', category: 'refund', amount: 1200, note: 'return' },
  { date: '2026-07-21', account: 'cash', category: 'dining', amount: -540, note: null },
];

// Replaces the table's contents so re-seeding is idempotent. Returns the row count inserted.
export function seedEntries(db: Db): number {
  db.delete(entries).run();
  addEntries(db, DEMO);
  return DEMO.length;
}
