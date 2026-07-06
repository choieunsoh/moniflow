import type { NewEntry } from './schema';

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

export type ImportResult = { entries: NewEntry[]; skipped: number };

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

export function parseMonefyCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  const body = rows.slice(1); // drop header
  const entries: NewEntry[] = [];
  let skipped = 0;
  for (const cols of body) {
    const category = cols[2];
    if (isSkippable(category)) {
      skipped += 1;
      continue;
    }
    const note = cols[7] ?? '';
    entries.push({
      date: toIsoDate(cols[0]),
      account: cols[1],
      category,
      amount: cleanAmount(cols[5]),
      currency: cols[4],
      originalAmount: cleanAmount(cols[3]),
      note: note === '' ? null : note,
    });
  }
  return { entries, skipped };
}
