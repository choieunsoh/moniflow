'use client';

import { useRouter } from 'next/navigation';
import { useNewEntry } from '@features/entries/use-new-entry';
import { addRuleAction } from '@features/recurring/actions';
import { RuleKeypad } from '@features/recurring/ui/RuleKeypad';
import { PageContainer } from '@shared/ui/PageContainer';
import { todayIso } from '@shared/date';
import { toast } from '@shared/ui/toast';

// A standing rule is an expense plus a schedule, so it is entered on the expense keypad's own
// surface. The feeding lists are literally the keypad's — useNewEntry already assembles exactly
// what's needed (categories, accounts, currencies, fee-inclusive rates, the last-used account), so
// this reuses it rather than growing a parallel hook that would drift from it.
export default function NewRulePage() {
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

  const {
    categories,
    accounts,
    currencies,
    currencyCodes,
    rates,
    ratesAsOf,
    defaultAccount,
    iconSet,
    keypadLayout,
  } = data;

  async function handleSubmit(formData: FormData): Promise<void> {
    await addRuleAction(formData);
    toast('Rule saved'); // module-level store + layout ToastRegion persist across the navigation
    router.push('/recurring');
  }

  return (
    <PageContainer size="full">
      {/* No visible title, for the reason /entries/new has none: the screen says what it is (the key
          grid, the "Choose category" button), and the ~90px a title block costs is the difference
          between that button sitting above or below the fold on a 412px frame. The heading stays for
          screen readers, which have no keypad to look at; the close control lives in the chip row. */}
      <h1 className="sr-only">Add recurring rule</h1>
      <RuleKeypad
        categories={categories}
        accounts={accounts}
        currencies={currencies}
        currencyCodes={currencyCodes}
        rates={rates}
        ratesAsOf={ratesAsOf}
        defaultAccount={defaultAccount}
        today={todayIso()}
        iconSet={iconSet}
        keypadLayout={keypadLayout}
        action={handleSubmit}
      />
    </PageContainer>
  );
}
