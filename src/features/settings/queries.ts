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
export async function getCutoff(db: Db): Promise<number> {
  const [row] = await db.select().from(settings).where(eq(settings.key, CUTOFF_KEY)).all();
  return row === undefined ? DEFAULT_CUTOFF : Number(row.value);
}

// Upsert via delete-then-insert in one batch — mirrors the replaceEntries pattern already used in
// entries/queries.ts. Simpler than onConflictDoUpdate for a single-row key.
export async function setCutoff(db: Db, day: number): Promise<void> {
  await db.batch([
    db.delete(settings).where(eq(settings.key, CUTOFF_KEY)),
    db.insert(settings).values({ key: CUTOFF_KEY, value: String(day) }),
  ]);
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
export async function getIconSet(db: Db): Promise<IconSet> {
  const [row] = await db.select().from(settings).where(eq(settings.key, ICON_SET_KEY)).all();
  return row !== undefined && isIconSet(row.value) ? row.value : DEFAULT_ICON_SET;
}

export async function setIconSet(db: Db, value: IconSet): Promise<void> {
  await db.batch([
    db.delete(settings).where(eq(settings.key, ICON_SET_KEY)),
    db.insert(settings).values({ key: ICON_SET_KEY, value }),
  ]);
}

// Card FX fee % — total markup over the ECB mid-rate (card-network cut + the user's bank
// foreign-transaction fee), layered on when converting a foreign entry to THB. Reuses the KV table
// like cutoff/icon-set. Default 2%.
const CARD_FEE_KEY = 'card_fx_fee_pct';
const DEFAULT_CARD_FEE = 2;

export function isValidCardFeePct(pct: number): boolean {
  return Number.isFinite(pct) && pct >= 0 && pct <= 10;
}

export async function getCardFeePct(db: Db): Promise<number> {
  const [row] = await db.select().from(settings).where(eq(settings.key, CARD_FEE_KEY)).all();
  if (row === undefined) return DEFAULT_CARD_FEE;
  const pct = Number(row.value);
  return isValidCardFeePct(pct) ? pct : DEFAULT_CARD_FEE;
}

export async function setCardFeePct(db: Db, pct: number): Promise<void> {
  await db.batch([
    db.delete(settings).where(eq(settings.key, CARD_FEE_KEY)),
    db.insert(settings).values({ key: CARD_FEE_KEY, value: String(pct) }),
  ]);
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

export async function getFxRates(db: Db): Promise<FxRates> {
  const [row] = await db.select().from(settings).where(eq(settings.key, FX_RATES_KEY)).all();
  if (row === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(row.value);
    return isFxRates(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function setFxRates(db: Db, rates: FxRates): Promise<void> {
  await db.batch([
    db.delete(settings).where(eq(settings.key, FX_RATES_KEY)),
    db.insert(settings).values({ key: FX_RATES_KEY, value: JSON.stringify(rates) }),
  ]);
}

// Whole-app font scale — one KV row driving the root html font-size. Stored as a short enum key;
// the percent it maps to (FONT_SCALE_PCT) is applied to document.documentElement so the entire
// rem-based UI scales at once. Mirrors the icon-set KV exactly — no new table, no migration.
const FONT_SCALE_KEY = 'font_scale';
export const FONT_SCALES = ['sm', 'md', 'lg', 'xl'] as const;
export type FontScale = (typeof FONT_SCALES)[number];
const DEFAULT_FONT_SCALE: FontScale = 'md';

// Percent (not px): resolves against the browser's own default font-size, so a user who raised
// their browser default for accessibility still scales correctly. Single source for the numbers —
// the reconciler hook imports this; the pre-paint inline script (layout.tsx) must inline the same
// literal because it can't import a module (documented there).
export const FONT_SCALE_PCT: Record<FontScale, string> = {
  sm: '87.5%',
  md: '100%',
  lg: '112.5%',
  xl: '125%',
};

// localStorage key for the pre-paint cache (see use-font-scale.ts and layout.tsx).
export const FONT_SCALE_STORAGE_KEY = 'moniflow_font_scale';

export function isFontScale(value: unknown): value is FontScale {
  return typeof value === 'string' && FONT_SCALES.some((s) => s === value);
}

// Falls back to md for a fresh DB or one that predates this setting.
export async function getFontScale(db: Db): Promise<FontScale> {
  const [row] = await db.select().from(settings).where(eq(settings.key, FONT_SCALE_KEY)).all();
  return row !== undefined && isFontScale(row.value) ? row.value : DEFAULT_FONT_SCALE;
}

export async function setFontScale(db: Db, value: FontScale): Promise<void> {
  await db.batch([
    db.delete(settings).where(eq(settings.key, FONT_SCALE_KEY)),
    db.insert(settings).values({ key: FONT_SCALE_KEY, value }),
  ]);
}
