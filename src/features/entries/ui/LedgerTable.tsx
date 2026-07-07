import Link from 'next/link';
import { formatSignedBaht } from '@shared/money';
import { formatDay } from '@shared/date';
import { deleteEntryAction } from '../actions';
import type { Entry } from '../schema';

// Recent entries, densest-legible. Amount is mono, right-aligned, signed AND colored so meaning
// survives grayscale. The panel clips the horizontal scroll on narrow viewports (structural
// responsive, not fluid type). Actions column: Edit navigates to the edit route; Delete posts
// straight to deleteEntryAction — both work without any client JS of their own.
export function LedgerTable({ entries }: { entries: Entry[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-base font-semibold">Recent entries</h2>
        <span className="chip">last {entries.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}>
              <Th className="text-left">Date</Th>
              <Th className="text-left">Category</Th>
              <Th className="text-left">Account</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className="border-t transition-colors duration-150 hover:bg-[var(--color-surface-2)]"
              >
                <td
                  className="tnum px-5 py-3 whitespace-nowrap"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {formatDay(e.date)}
                </td>
                <td className="px-5 py-3">
                  <span className="chip">{e.category}</span>
                </td>
                <td className="px-5 py-3" style={{ color: 'var(--color-muted)' }}>
                  {e.account}
                </td>
                <td
                  className="tnum px-5 py-3 text-right font-medium whitespace-nowrap"
                  style={{ color: e.amount < 0 ? 'var(--color-loss)' : 'var(--color-gain)' }}
                >
                  {formatSignedBaht(e.amount)}
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-3 text-xs">
                    <Link
                      href={`/entries/${e.id}/edit`}
                      className="hover:underline"
                      style={{ color: 'var(--color-accent-text)' }}
                    >
                      Edit
                    </Link>
                    <form action={deleteEntryAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <button
                        type="submit"
                        className="hover:underline"
                        style={{ color: 'var(--color-loss)' }}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-5 py-2.5 text-xs font-medium ${className}`}>{children}</th>;
}
