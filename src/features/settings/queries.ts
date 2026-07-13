import { eq } from 'drizzle-orm';
import type { Db } from '@db/client';
import { settings } from './schema';

const CUTOFF_KEY = 'cutoff_day';
// Intentionally a plain literal, not imported from entries/cycle.ts's CUTOFF constant — settings
// and entries don't depend on each other (see the design doc's dependency-rule note). Both equal
// 18 because that happens to be the user's real cutoff today, not because they're coupled.
const DEFAULT_CUTOFF = 18;

// Falls back to DEFAULT_CUTOFF for a fresh DB, or one that predates this feature — upgrading is
// invisible until the user opts into changing it via /settings.
export function getCutoff(db: Db): number {
  const [row] = db.select().from(settings).where(eq(settings.key, CUTOFF_KEY)).all();
  return row === undefined ? DEFAULT_CUTOFF : Number(row.value);
}

// Upsert via delete-then-insert inside a transaction — mirrors the replaceEntries pattern already
// used in entries/queries.ts. Simpler than onConflictDoUpdate for a single-row key.
export function setCutoff(db: Db, day: number): void {
  db.transaction((tx) => {
    tx.delete(settings).where(eq(settings.key, CUTOFF_KEY)).run();
    tx.insert(settings)
      .values({ key: CUTOFF_KEY, value: String(day) })
      .run();
  });
}

// Pure validator, reused by the Server Action so the 1..28 rule lives in exactly one place. 28 is
// the ceiling because every month has at least 28 days — 29/30/31 would be ambiguous or
// impossible in some months.
export function isValidCutoffDay(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= 28;
}

// Which icon style renders category markers app-wide. 'emoji' keeps the native glyph; the others
// map each category's stored emoji to a line-icon component (see categories/icon-map.*). Reuses the
// generic settings table — no new migration, as the table's own comment anticipated.
const ICON_SET_KEY = 'icon_set';
export const ICON_SETS = ['emoji', 'phosphor', 'lucide'] as const;
export type IconSet = (typeof ICON_SETS)[number];
const DEFAULT_ICON_SET: IconSet = 'emoji';

export function isIconSet(value: unknown): value is IconSet {
  return typeof value === 'string' && ICON_SETS.some((s) => s === value);
}

// Falls back to emoji for a fresh DB or one that predates this setting.
export function getIconSet(db: Db): IconSet {
  const [row] = db.select().from(settings).where(eq(settings.key, ICON_SET_KEY)).all();
  return row !== undefined && isIconSet(row.value) ? row.value : DEFAULT_ICON_SET;
}

export function setIconSet(db: Db, value: IconSet): void {
  db.transaction((tx) => {
    tx.delete(settings).where(eq(settings.key, ICON_SET_KEY)).run();
    tx.insert(settings).values({ key: ICON_SET_KEY, value }).run();
  });
}

// Card FX fee % — total markup over the ECB mid-rate (card-network cut + the user's bank
// foreign-transaction fee), layered on when converting a foreign entry to THB. Reuses the KV table
// like cutoff/icon-set. Default 2%.
const CARD_FEE_KEY = 'card_fx_fee_pct';
const DEFAULT_CARD_FEE = 2;

export function isValidCardFeePct(pct: number): boolean {
  return Number.isFinite(pct) && pct >= 0 && pct <= 10;
}

export function getCardFeePct(db: Db): number {
  const [row] = db.select().from(settings).where(eq(settings.key, CARD_FEE_KEY)).all();
  if (row === undefined) return DEFAULT_CARD_FEE;
  const pct = Number(row.value);
  return isValidCardFeePct(pct) ? pct : DEFAULT_CARD_FEE;
}

export function setCardFeePct(db: Db, pct: number): void {
  db.transaction((tx) => {
    tx.delete(settings).where(eq(settings.key, CARD_FEE_KEY)).run();
    tx.insert(settings)
      .values({ key: CARD_FEE_KEY, value: String(pct) })
      .run();
  });
}

// Cached ECB reference rates, one JSON blob under a single KV key. thbPerUnit is the mid-rate
// (fee applied later at conversion time); asOf is the ECB fixing date from the response.
// Offline-tolerant: callers keep the last blob when a refresh fails.
const FX_RATES_KEY = 'fx_rates';
export type FxRateEntry = { thbPerUnit: number; asOf: string };
export type FxRates = Record<string, FxRateEntry>;

function isFxRates(value: unknown): value is FxRates {
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value).every(
    (v: unknown) =>
      typeof v === 'object' &&
      v !== null &&
      'thbPerUnit' in v &&
      'asOf' in v &&
      typeof v.thbPerUnit === 'number' &&
      typeof v.asOf === 'string',
  );
}

export function getFxRates(db: Db): FxRates {
  const [row] = db.select().from(settings).where(eq(settings.key, FX_RATES_KEY)).all();
  if (row === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(row.value);
    return isFxRates(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function setFxRates(db: Db, rates: FxRates): void {
  db.transaction((tx) => {
    tx.delete(settings).where(eq(settings.key, FX_RATES_KEY)).run();
    tx.insert(settings)
      .values({ key: FX_RATES_KEY, value: JSON.stringify(rates) })
      .run();
  });
}
