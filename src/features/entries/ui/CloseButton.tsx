'use client';

import { useRouter } from 'next/navigation';

// Top-right close for the add/edit flow: dismisses back to wherever it was opened from (the FAB from
// any tab, or Records for an edit). Inline SVG × in the app's chrome-icon house style (cf. BottomBar)
// — no icon dependency. Muted at rest so it stays quiet next to the page title.
export function CloseButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Close"
      className="tap -mr-1 shrink-0 justify-center rounded-full px-2 transition-opacity active:opacity-70"
      style={{ color: 'var(--color-muted)' }}
    >
      <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M4.5 4.5l7 7M11.5 4.5l-7 7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
