'use client';

import { useRouter } from 'next/navigation';
import { useNewEntry } from '@features/entries/use-new-entry';
import { addEntryAction } from '@features/entries/actions';
import { Keypad } from '@features/entries/ui/Keypad';
import { PageContainer } from '@shared/ui/PageContainer';
import { todayIso } from '@shared/date';
import { toast } from '@shared/ui/toast';

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

  const { categories, accounts, currencies, notes, rates, ratesAsOf, defaultAccount, iconSet } =
    data;

  async function handleSubmit(formData: FormData): Promise<void> {
    await addEntryAction(formData);
    toast('Entry saved'); // module-level store + layout ToastRegion persist across the navigation
    router.push('/');
  }

  return (
    <PageContainer size="full">
      {/* The visible title and its "keypad does math / tap a category to save" caption are gone: the
          screen says both already (the accent ＋ − × ÷ keys, the "Choose category" button), and the
          ~90px they cost was the difference between that button sitting above or below the fold on a
          412px frame. The heading stays for screen readers, which have no keypad to look at, and the
          close control moved into the keypad's own date/currency/account row. */}
      <h1 className="sr-only">Add expense</h1>
      <Keypad
        categories={categories}
        accounts={accounts}
        currencies={currencies}
        notes={notes}
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
