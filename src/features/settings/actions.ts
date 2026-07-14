import { getBrowserDb } from '@db/browser';
import {
  setCutoff,
  isValidCutoffDay,
  setIconSet,
  isIconSet,
  setFontScale,
  isFontScale,
} from './queries';
import { setCardFeePct, isValidCardFeePct, getFxRates, setFxRates } from './queries';
import type { FxRates } from './queries';
import { CURRENCIES } from '@features/entries/entry-form';
import { frankfurterUrl, parseEcbResponse } from '@features/entries/fx';
import { wipeAllData } from './data';
import { bumpDataVersion } from '@shared/data-version';

// Client-side settings writes against the browser OPFS db (offline-first — no
// 'use server'/revalidatePath; the worker bootstraps tables, so no ensure* needed). Validates before
// writing (the <input min/max> only constrains well-behaved browsers — this is the real guard). Each
// successful write bumps the shared data-version store so live read-hooks (Plan 2b) refetch.
export async function setCutoffAction(formData: FormData): Promise<void> {
  const raw = formData.get('day');
  const day = Number(raw);
  if (!isValidCutoffDay(day)) {
    const shown = typeof raw === 'string' ? raw : 'a file';
    throw new Error(`Cutoff day must be an integer between 1 and 28, got: ${shown}`);
  }
  const db = await getBrowserDb();
  await setCutoff(db, day);
  bumpDataVersion();
}

// Backing the icon-set picker. Validates the value is a known set, then bumps the data version so
// every category marker re-renders in the chosen style at once.
export async function setIconSetAction(formData: FormData): Promise<void> {
  const value = formData.get('iconSet');
  if (!isIconSet(value)) {
    throw new Error(`Unknown icon set: ${typeof value === 'string' ? value : 'a file'}`);
  }
  const db = await getBrowserDb();
  await setIconSet(db, value);
  bumpDataVersion();
}

// Backing the font-size picker. Validates the value is a known scale, writes OPFS (source of truth),
// then bumps the data-version — which re-runs useFontScale, resizing the app live and refreshing the
// localStorage paint cache. The action deliberately does NOT write localStorage or html: single
// writer = the reconciler hook.
export async function setFontScaleAction(formData: FormData): Promise<void> {
  const value = formData.get('fontScale');
  if (!isFontScale(value)) {
    throw new Error(`Unknown font scale: ${typeof value === 'string' ? value : 'a file'}`);
  }
  const db = await getBrowserDb();
  await setFontScale(db, value);
  bumpDataVersion();
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
  const db = await getBrowserDb();
  await setCardFeePct(db, pct);
  bumpDataVersion();
}

// Manually refresh cached FX rates from the ECB daily reference rates (frankfurter.dev) — one plain
// HTTPS call for every non-THB currency at once. On any failure the previous cache is left intact
// (offline-tolerant). The `asOf` is the ECB fixing date from the response, so the keypad shows the real
// rate date, not "now".
export async function refreshFxRatesAction(): Promise<void> {
  const db = await getBrowserDb();
  const next: FxRates = { ...(await getFxRates(db)) };
  try {
    const res = await fetch(frankfurterUrl(CURRENCIES), { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const json: unknown = await res.json();
      const { date, thbPerUnit } = parseEcbResponse(json);
      for (const [code, rate] of Object.entries(thbPerUnit)) {
        next[code] = { thbPerUnit: rate, asOf: date };
      }
    }
  } catch {
    // Keep the existing cache — offline-tolerant.
  }
  await setFxRates(db, next);
  bumpDataVersion();
}

// Irreversible: clear every entry, category, and budget, then bump the data version so all surfaces
// re-render empty. Confirm-gated in the UI (WipeAllData + ConfirmDialog).
export async function wipeAllDataAction(): Promise<void> {
  const db = await getBrowserDb();
  await wipeAllData(db);
  bumpDataVersion();
}
