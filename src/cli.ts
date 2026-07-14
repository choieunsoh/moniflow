import { readFileSync } from 'node:fs';
import 'dotenv/config';
import { Command } from 'commander';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { parseMonefyCsv } from '@features/entries/import';
import { getEntries, getNetFlow, replaceEntries } from '@features/entries/queries';
import { seedEntries } from '@features/entries/seed';
import { formatBaht } from '@shared/money';

// Composition root: wires shared infra (initDb) to feature modules. This is the one place that
// knows about every feature — the features themselves stay decoupled.
const program = new Command();
program.name('moniflow').description('Personal money-flow dashboard CLI');

program
  .command('summary')
  .description('Print net flow across all entries')
  .option('--db <path>', 'SQLite path', process.env.MONIFLOW_DB ?? 'data/moniflow.db')
  .action(async (opts: { db: string }) => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    const count = (await getEntries(db)).length;
    console.log(`${count} entries · net ${formatBaht(await getNetFlow(db))}`);
  });

program
  .command('seed')
  .description('Load demo money-flow entries (replaces existing)')
  .option('--db <path>', 'SQLite path', process.env.MONIFLOW_DB ?? 'data/moniflow.db')
  .action(async (opts: { db: string }) => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    const n = await seedEntries(db);
    console.log(
      `seeded ${n} demo entries — run \`npm run dev:web\` and open http://127.0.0.1:4010`,
    );
  });

program
  .command('import <file>')
  .description('Replace the ledger with a Monefy CSV export')
  .option('--db <path>', 'SQLite path', process.env.MONIFLOW_DB ?? 'data/moniflow.db')
  .action(async (file: string, opts: { db: string }) => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    const { entries, skipped } = parseMonefyCsv(readFileSync(file, 'utf8'));
    await replaceEntries(db, entries);
    console.log(
      `imported ${entries.length}, skipped ${skipped} — run \`npm run dev:web\` and open http://127.0.0.1:4010`,
    );
  });

program.parse();
