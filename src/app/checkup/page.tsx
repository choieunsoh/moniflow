'use client';

import { PageContainer } from '@shared/ui/PageContainer';
import { DuplicateScan } from '@features/entries/ui/DuplicateScan';

// Data-quality checks over the whole ledger, on demand. One check today; the route is named for the
// job rather than the check because an installed PWA's pinned URL is expensive to change.
//
// Unlike every other route this one holds no read hook, and therefore no `…` placeholder: nothing is
// read until the scan button is pressed, so the page paints complete on its first frame.
export default function CheckupPage() {
  return (
    <PageContainer size="full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Checkup</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Rows sharing a date, an amount and a category. Three things write to the ledger and none
          of them checks the others.
        </p>
      </header>
      <DuplicateScan />
    </PageContainer>
  );
}
