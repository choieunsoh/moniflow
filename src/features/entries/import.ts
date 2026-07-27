import type { EntryInput, EntryRow } from './schema';

// Pure Monefy-CSV → entries mapping. No DB, no fs — the CLI reads the file and calls this, which
// is what makes it unit-testable. The parser handles Monefy's quoting: fields with commas (money
// like "12,000") are double-quoted; embedded quotes are doubled ("").
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

// Categories that are transfers/balances, not real money flow — dropped on import. Confirmed
// against the real export in Task 4; add entries here if that enumeration surfaces more.
export const SKIP_CATEGORIES: readonly string[] = ['บัตรเครดิท'];

export type ImportResult = { entries: EntryInput[]; skipped: number };

const isoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' });

// 'DD/MM/YYYY' → 'YYYY-MM-DD'. Machine format: parse the numeric parts, then format via Intl.
function toIsoDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('/').map(Number);
  return isoFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

// '"-3,960"' has already lost its quotes in parseCsv → '-3,960'. Strip thousands commas, parse.
function cleanAmount(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

function isSkippable(category: string): boolean {
  return SKIP_CATEGORIES.includes(category) || category.startsWith('Initial balance');
}

// entries.off_budget is a TRI-state: null = inherit the category's default, 0 = force on-budget,
// 1 = force off-budget. A genuine Monefy CSV has only 8 columns, so cols[8] is undefined there —
// which must read as null (inherit), never 0 (force on-budget); the two differ in the budget meters
// whenever the category itself is off-budget. Anything unrecognised degrades to null for the same
// reason: inheriting is the safe default, forcing is not.
function parseOffBudget(raw: string | undefined): number | null {
  if (raw === '0') return 0;
  if (raw === '1') return 1;
  return null;
}

export function parseMonefyCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  const body = rows.slice(1); // drop header
  const entries: EntryInput[] = [];
  let skipped = 0;
  for (const cols of body) {
    const category = cols[2];
    if (isSkippable(category)) {
      skipped += 1;
      continue;
    }
    // Spending tracker: drop inflows (income/transfers-in land as amount >= 0). This is what keeps
    // income-only categories (e.g. เงินสด/salary) out of the ledger, so the /categories counts and
    // every expenses-only read surface stay in sync. ponytail: sign is the whole test — Monefy marks
    // outflows negative; if a real export ever ships a 0-amount expense, revisit this bound.
    const amount = cleanAmount(cols[5]);
    if (amount >= 0) {
      skipped += 1;
      continue;
    }
    const note = cols[7] ?? '';
    entries.push({
      date: toIsoDate(cols[0]),
      account: cols[1],
      category,
      amount,
      currency: cols[4],
      originalAmount: cleanAmount(cols[3]),
      note: note === '' ? null : note,
      source: 'monefy',
      offBudget: parseOffBudget(cols[8]),
    });
  }
  return { entries, skipped };
}

// The header moniflow writes — the byte-for-byte inverse of what parseMonefyCsv reads. The first
// EIGHT columns are Monefy's own (the 5th and 7th are both "currency": the source currency, then the
// THB home currency, constant); `off_budget` is a 9th column moniflow appends for a field Monefy has
// no concept of. The extension is compatible both ways: parseMonefyCsv indexes columns, so a real
// 8-column Monefy export still parses (cols[8] undefined → null), and a reader that knows only the
// original 8 ignores the extra field.
export const MONEFY_HEADER =
  'date,account,category,amount,currency,converted amount,currency,description,off_budget';

// 'YYYY-MM-DD' (UTC key) → 'DD/MM/YYYY'. UTC (not Bangkok) so it re-parses to the identical key via
// toIsoDate — a lossless round-trip. en-GB with 2-digit day/month + numeric year renders the slashes.
const ddmmyyyyFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});
function toDdmmyyyy(iso: string): string {
  return ddmmyyyyFmt.format(new Date(`${iso}T00:00:00Z`));
}

// Quote a CSV field only when it contains a comma, double-quote, or newline; embedded quotes doubled.
// Matches exactly what parseCsv round-trips.
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Only the columns the export reads — getEntries' EntryRow[] satisfies this structurally, and it keeps
// the unit tests from having to build a full EntryRow (id/time/accountId/… are irrelevant here).
type ExportRow = Pick<
  EntryRow,
  'date' | 'account' | 'category' | 'amount' | 'currency' | 'originalAmount' | 'note' | 'offBudget'
>;

// Pure ledger → Monefy CSV. Inverse of parseMonefyCsv. Amounts emitted plain (no thousands commas);
// parseCsv strips commas on the way back either way. `time` and `source` have no column in the format
// and are intentionally not serialized (see the design doc's fidelity caveats). `off_budget` DOES ride
// along (9th column) — it is user intent, not derivable, so dropping it silently lost data on restore.
export function serializeMonefyCsv(rows: readonly ExportRow[]): string {
  const lines = [MONEFY_HEADER];
  for (const r of rows) {
    const currency = r.currency ?? 'THB';
    const original = r.originalAmount ?? r.amount;
    lines.push(
      [
        toDdmmyyyy(r.date),
        csvField(r.account),
        csvField(r.category),
        String(original),
        csvField(currency),
        String(r.amount),
        'THB',
        csvField(r.note ?? ''),
        r.offBudget === null || r.offBudget === undefined ? '' : String(r.offBudget),
      ].join(','),
    );
  }
  return lines.join('\n');
}
