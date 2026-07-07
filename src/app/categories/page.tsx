// Reads the local SQLite DB per request — same rationale as the dashboard page: better-sqlite3
// can't be prerendered, and the category list must reflect the latest import/merge.
export const dynamic = 'force-dynamic';

import type { ReactNode } from 'react';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getCategoryCounts } from '@features/entries/queries';
import { mergeCategoryAction } from '@features/entries/actions';
import { PageContainer } from '@shared/ui/PageContainer';

export default function CategoriesPage() {
  const db = initDb();
  ensureEntriesTable(db);
  const counts = getCategoryCounts(db);

  return (
    <PageContainer size="wide">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Ten years of hand-typed categories fragment (&quot;ช็อปปิ้ง&quot; vs &quot;ช็อปปิ้ง
          ชมพู่&quot;). Rename one to clean it up, or type an existing name to merge into it.
        </p>
      </header>

      <section className="panel overflow-hidden">
        {counts.length === 0 ? (
          <p className="p-5 text-sm" style={{ color: 'var(--color-muted)' }}>
            No categories yet — import or add some entries first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}>
                  <Th className="text-left">Category</Th>
                  <Th className="text-right">Entries</Th>
                  <Th className="text-left">Rename / merge into</Th>
                </tr>
              </thead>
              <tbody>
                {counts.map((c) => (
                  <tr key={c.category} className="border-t">
                    <td className="px-5 py-3">
                      <span className="chip">{c.category}</span>
                    </td>
                    <td
                      className="tnum px-5 py-3 text-right"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {c.count}
                    </td>
                    <td className="px-5 py-3">
                      <form action={mergeCategoryAction} className="flex items-center gap-2">
                        <input type="hidden" name="from" value={c.category} />
                        <input
                          name="to"
                          list="category-options"
                          placeholder="new or existing name…"
                          required
                          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm"
                          style={{
                            background: 'var(--color-surface-2)',
                            color: 'var(--color-text)',
                          }}
                        />
                        <button type="submit" className="btn btn-ghost">
                          Apply
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <datalist id="category-options">
        {counts.map((c) => (
          <option key={c.category} value={c.category} />
        ))}
      </datalist>
    </PageContainer>
  );
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`px-5 py-2.5 text-xs font-medium ${className}`}>{children}</th>;
}
