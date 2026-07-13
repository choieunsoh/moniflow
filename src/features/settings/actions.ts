'use server';

import { revalidatePath } from 'next/cache';
import { initDb } from '@db/client';
import { ensureSettingsTable } from './schema';
import { setCutoff, isValidCutoffDay, setIconSet, isIconSet } from './queries';
import { setCardFeePct, isValidCardFeePct, getFxRates, setFxRates } from './queries';
import type { FxRates } from './queries';
import { CURRENCIES } from '@features/entries/entry-form';
import { visaRatesUrl, parseVisaThbPerUnit } from '@features/entries/fx';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { wipeAllData } from './data';

// Server Action backing the /settings form. Validates before writing (the <input min/max> only
// constrains well-behaved browsers — this is the real guard), then revalidates both pages that
// read the cutoff so a fresh visit reflects the change immediately.
export async function setCutoffAction(formData: FormData): Promise<void> {
  const raw = formData.get('day');
  const day = Number(raw);
  if (!isValidCutoffDay(day)) {
    const shown = typeof raw === 'string' ? raw : 'a file';
    throw new Error(`Cutoff day must be an integer between 1 and 28, got: ${shown}`);
  }
  const db = initDb();
  ensureSettingsTable(db);
  setCutoff(db, day);
  revalidatePath('/', 'layout');
}

// Server Action backing the icon-set picker. Validates the value is a known set, then revalidates
// the whole app so every category marker re-renders in the chosen style at once.
export async function setIconSetAction(formData: FormData): Promise<void> {
  const value = formData.get('iconSet');
  if (!isIconSet(value)) {
    throw new Error(`Unknown icon set: ${typeof value === 'string' ? value : 'a file'}`);
  }
  const db = initDb();
  ensureSettingsTable(db);
  setIconSet(db, value);
  revalidatePath('/', 'layout');
}

// Save the card FX fee %. Validated (0..10) before writing; the <input> min/max is only a hint.
export async function setCardFeePctAction(formData: FormData): Promise<void> {
  const raw = formData.get('pct');
  const pct = Number(raw);
  if (!isValidCardFeePct(pct)) {
    throw new Error(
      `Card FX fee must be between 0 and 10, got: ${typeof raw === 'string' ? raw : 'a file'}`,
    );
  }
  const db = initDb();
  ensureSettingsTable(db);
  setCardFeePct(db, pct);
  revalidatePath('/', 'layout');
}

// Manually refresh cached Visa rates for every non-THB currency. One HTTP call per currency; a
// failed pair keeps its last cached value rather than aborting. Rates cached fee-free (pure Visa).
export async function refreshFxRatesAction(): Promise<void> {
  const db = initDb();
  ensureSettingsTable(db);
  const next: FxRates = { ...getFxRates(db) };
  const now = new Date();
  const asOf = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
  for (const code of CURRENCIES) {
    if (code === 'THB') continue;
    try {
      const res = await fetch(visaRatesUrl(code, now), {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      if (!res.ok) continue;
      const json: unknown = await res.json();
      next[code] = { thbPerUnit: parseVisaThbPerUnit(json), asOf };
    } catch {
      // Keep the last cached value for this currency — offline-tolerant.
    }
  }
  setFxRates(db, next);
  revalidatePath('/', 'layout');
}

// Irreversible: clear every entry, category, and budget, then revalidate the whole app so all
// surfaces re-render empty. Confirm-gated in the UI (WipeAllData + ConfirmDialog).
export async function wipeAllDataAction(): Promise<void> {
  const db = initDb();
  ensureEntriesTable(db);
  ensureCategoriesTable(db);
  ensureBudgetsTable(db);
  wipeAllData(db);
  revalidatePath('/', 'layout');
}
