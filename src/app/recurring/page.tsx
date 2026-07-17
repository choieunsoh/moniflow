'use client';

import { PageContainer } from '@shared/ui/PageContainer';
import { useRecurring } from '@features/recurring/use-recurring';
import { useRecurringCatalog } from '@features/recurring/use-recurring-catalog';
import { RecurringList } from '@features/recurring/ui/RecurringList';

// Recurring rules: subscriptions, bills, installments that post themselves into the ledger. Two hooks
// load client-side against the browser OPFS db — useRecurring (the rules + progress + total) and
// useRecurringCatalog (the category marker each row shows); see their comments for why they're split
// rather than one combined hook. size="full" matches /records, whose row-and-section vocabulary this
// page borrows.
export default function RecurringPage() {
  const { ready: rulesReady, rules, monthlyTotal } = useRecurring();
  const { ready: catalogReady, catalog } = useRecurringCatalog();
  const ready = rulesReady && catalogReady && catalog !== null;

  if (!ready || catalog === null) {
    return (
      <PageContainer size="full">
        <div
          className="grid h-32 place-items-center text-sm"
          style={{ color: 'var(--color-muted)' }}
        >
          …
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="full">
      {/* sr-only heading root — the recurring list has no visible page title, so without this a
          screen reader's heading list starts at the section <h2>s with no <h1> above them. */}
      <h1 className="sr-only">Recurring</h1>
      <RecurringList
        rules={rules}
        monthlyTotal={monthlyTotal}
        metaById={catalog.metaById}
        iconSet={catalog.iconSet}
      />
    </PageContainer>
  );
}
