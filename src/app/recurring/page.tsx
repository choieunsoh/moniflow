'use client';

import { PageContainer } from '@shared/ui/PageContainer';
import { useRecurring } from '@features/recurring/use-recurring';
import { useRecurringCatalog } from '@features/recurring/use-recurring-catalog';
import { RecurringList } from '@features/recurring/ui/RecurringList';

// Recurring rules: subscriptions, bills, installments that post themselves into the ledger. Two
// hooks load client-side against the browser OPFS db — useRecurring (the rules + progress + total)
// and useRecurringCatalog (the category/account names the rows and form need); see their comments
// for why they're split rather than one combined hook.
export default function RecurringPage() {
  const { ready: rulesReady, rules, monthlyTotal } = useRecurring();
  const { ready: catalogReady, catalog } = useRecurringCatalog();
  const ready = rulesReady && catalogReady && catalog !== null;

  if (!ready || catalog === null) {
    return (
      <PageContainer size="narrow">
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
    <PageContainer size="narrow">
      <RecurringList
        rules={rules}
        monthlyTotal={monthlyTotal}
        metaById={catalog.metaById}
        categoryNames={catalog.categoryNames}
        accountNames={catalog.accountNames}
        iconSet={catalog.iconSet}
      />
    </PageContainer>
  );
}
