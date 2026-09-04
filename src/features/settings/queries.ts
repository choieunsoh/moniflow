import { eq } from 'drizzle-orm';
import type { Db } from '@db/client';
import { settings } from './schema';
import type { SettingRow } from './catalog';
import { DEFAULT_ACCENT, DEFAULT_THEME, isAccent, isTheme, type Accent, type Theme } from './theme';

// The whole settings KV table, for a backup — dumped as-is (cutoff, icon set, font scale, card fee,
// keypad layout, fx-rate cache) so a new setting is captured without touching this function.
export async function getAllSettings(db: Db): Promise<SettingRow[]> {
  return await db.select({ key: settings.key, value: settings.value }).from(settings).all();
}

// Restore settings from a backup: upsert each key (delete-then-insert, the same one-key pattern the
// setters below use). MERGE — a key the file omits keeps its current value, so restoring a partial
// backup never silently resets an unrelated preference.
export async function restoreSettings(db: Db, rows: SettingRow[]): Promise<void> {
  for (const { key, value } of rows) {
    await db.batch([
      db.delete(settings).where(eq(settings.key, key)),
      db.insert(settings).values({ key, value }),
    ]);
  }
}

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
// like cutoff/icon-set. Default 2.5%.
const CARD_FEE_KEY = 'card_fx_fee_pct';
const DEFAULT_CARD_FEE = 2.5;

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

// Numpad digit arrangement on the add-expense keypad. 'calc' is the calculator/Monefy order (7-8-9
// top); 'phone' is the telephone/ATM order (1-2-3 top). Only the digit ordering changes — the
// operator column and bottom row are fixed (see KEYPAD_KEYS in ui/Keypad.tsx). Reuses the KV table
// like icon-set/font-scale — no new migration.
const KEYPAD_LAYOUT_KEY = 'keypad_layout';
export const KEYPAD_LAYOUTS = ['calc', 'phone'] as const;
export type KeypadLayout = (typeof KEYPAD_LAYOUTS)[number];
const DEFAULT_KEYPAD_LAYOUT: KeypadLayout = 'calc';

export function isKeypadLayout(value: unknown): value is KeypadLayout {
  return typeof value === 'string' && KEYPAD_LAYOUTS.some((l) => l === value);
}

// Falls back to calc (the original layout) for a fresh DB or one that predates this setting.
export async function getKeypadLayout(db: Db): Promise<KeypadLayout> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEYPAD_LAYOUT_KEY)).all();
  return row !== undefined && isKeypadLayout(row.value) ? row.value : DEFAULT_KEYPAD_LAYOUT;
}

export async function setKeypadLayout(db: Db, value: KeypadLayout): Promise<void> {
  await db.batch([
    db.delete(settings).where(eq(settings.key, KEYPAD_LAYOUT_KEY)),
    db.insert(settings).values({ key: KEYPAD_LAYOUT_KEY, value }),
  ]);
}

// Appearance — two KV rows driving the two theme axes. Same shape as the font-scale block above:
// short enum keys, no new table, no migration. The DB is the source of truth; use-theme.ts keeps a
// localStorage copy for the pre-paint script, and is the only writer of it.
//
// Both ride in the backup with no catalog change, because catalog.ts carries the settings table as
// a generic SettingRow[] blob rather than a named list of keys.
const THEME_KEY = 'theme';
const ACCENT_KEY = 'accent';

/** Falls back to 'system' for a fresh DB, one that predates this setting, or a corrupted value. */
export async function getTheme(db: Db): Promise<Theme> {
  const [row] = await db.select().from(settings).where(eq(settings.key, THEME_KEY)).all();
  return row !== undefined && isTheme(row.value) ? row.value : DEFAULT_THEME;
}

export async function setTheme(db: Db, value: Theme): Promise<void> {
  await db.batch([
    db.delete(settings).where(eq(settings.key, THEME_KEY)),
    db.insert(settings).values({ key: THEME_KEY, value }),
  ]);
}

/** Falls back to 'ink' — the palette the bare :root declares — on the same three cases. */
export async function getAccent(db: Db): Promise<Accent> {
  const [row] = await db.select().from(settings).where(eq(settings.key, ACCENT_KEY)).all();
  return row !== undefined && isAccent(row.value) ? row.value : DEFAULT_ACCENT;
}

export async function setAccent(db: Db, value: Accent): Promise<void> {
  await db.batch([
    db.delete(settings).where(eq(settings.key, ACCENT_KEY)),
    db.insert(settings).values({ key: ACCENT_KEY, value }),
  ]);
}
