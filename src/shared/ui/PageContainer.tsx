import type { ReactNode } from 'react';

// The single source of the app's page frame: a centered column with responsive gutters (tighter on
// mobile) and a per-page max-width. Replaces the `mx-auto flex max-w-[…] flex-col gap-6 px-5 py-10`
// wrapper that was hand-rolled on every data page, so the mobile gutter/rhythm is fixed in one place.
const WIDTHS = {
  form: 'max-w-[640px]', // entries new/edit, settings
  narrow: 'max-w-[720px]', // budgets
  wide: 'max-w-[840px]', // categories
  full: 'max-w-[1120px]', // dashboard, trips
} as const;

export function PageContainer({
  size = 'full',
  children,
}: {
  size?: keyof typeof WIDTHS;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto flex ${WIDTHS[size]} flex-col gap-6 px-4 py-6 sm:px-5 sm:py-10`}>
      {children}
    </div>
  );
}
