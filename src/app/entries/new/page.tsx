'use client';

import { useRouter } from 'next/navigation';
import { useNewEntry } from '@features/entries/use-new-entry';
import { addEntryAction } from '@features/entries/actions';
import { Keypad } from '@features/entries/ui/Keypad';
import { CloseButton } from '@features/entries/ui/CloseButton';
import { PageContainer } from '@shared/ui/PageContainer';
import { todayIso } from '@shared/date';

// The keypad-feeding lists load client-side via useNewEntry against the browser OPFS db. The write
// itself (addEntryAction) no longer redirects server-side (Plan 2b dropped it), so this page navigates
// home after a successful submit instead.
export default function NewEntryPage() {
  const router = useRouter();
  const { ready, data } = useNewEntry();

  if (!ready || data === null) {
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

  const { categories, accounts, currencies, rates, ratesAsOf, defaultAccount, iconSet } = data;

  async function handleSubmit(formData: FormData): Promise<void> {
    await addEntryAction(formData);
    router.push('/');
  }

  return (
    <PageContainer size="full">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Add expense</h1>
          <p className="text-sm" style={{ color: 'var(--color-faint)' }}>
            Keypad does math (＋ − × ÷) — tap a category to save.
          </p>
        </div>
        <CloseButton />
      </header>
      <Keypad
        categories={categories}
        accounts={accounts}
        currencies={currencies}
        rates={rates}
        ratesAsOf={ratesAsOf}
        defaultAccount={defaultAccount}
        today={todayIso()}
        iconSet={iconSet}
        action={handleSubmit}
      />
    </PageContainer>
  );
}
