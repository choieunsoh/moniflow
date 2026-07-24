'use client';

import { PageContainer } from '@shared/ui/PageContainer';
import { useDashboard } from '@features/entries/use-dashboard';
import { DashboardCards } from '@features/entries/ui/DashboardCards';
import { DashboardSkeleton } from '@features/entries/ui/DashboardSkeleton';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Dashboard = the current-cycle overview. Home answers "what did I spend this cycle"; Analytics "is
// that normal for me"; this answers "where is this cycle heading, and can I still afford the rest of
// it". Always the current cycle (no ?cycle=), loaded client-side via useDashboard against the browser
// OPFS db.
export default function DashboardPage() {
  const { ready, data } = useDashboard();

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <DashboardSkeleton />
      </PageContainer>
    );
  }

  // No spend this cycle — reuse the shared empty state (points at the keypad / CSV restore) rather
  // than rendering four blank cards, matching Analytics' choice.
  if (data.count === 0) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Dashboard</h1>
        <EmptyLedger />
      </PageContainer>
    );
  }

  return (
    <PageContainer size="full">
      {/* sr-only heading root — the visible headings are the card <h2>s, so without this the heading
          list has no <h1>. Matches Home/Records/Analytics. */}
      <h1 className="sr-only">Dashboard</h1>
      <DashboardCards data={data} />
    </PageContainer>
  );
}
