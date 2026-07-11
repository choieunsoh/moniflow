'use client';

import { useState } from 'react';

// Bulk toggle for the records group sections (native <details>). One button whose label follows its
// own last action — it force-sets every section, so it self-corrects even if individual sections
// were toggled by hand in between. Scoped to [data-records-section] so no stray <details> is caught.
export function CollapseAllButton() {
  // Sections render collapsed by default (see the records page), so the button starts as "Expand all".
  const [allOpen, setAllOpen] = useState(false);
  function toggle() {
    const next = !allOpen;
    for (const el of document.querySelectorAll('details[data-records-section]')) {
      if (el instanceof HTMLDetailsElement) el.open = next;
    }
    setAllOpen(next);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="text-xs font-medium transition-opacity active:opacity-70"
      style={{ color: 'var(--color-accent-text)' }}
    >
      {allOpen ? 'Collapse all' : 'Expand all'}
    </button>
  );
}
