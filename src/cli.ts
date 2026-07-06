import 'dotenv/config';
import { Command } from 'commander';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getEntries, getNetFlow } from '@features/entries/queries';
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
  .action((opts: { db: string }) => {
    const db = initDb(opts.db);
    ensureEntriesTable(db);
    const count = getEntries(db).length;
    console.log(`${count} entries · net ${formatBaht(getNetFlow(db))}`);
  });

program
  .command('seed')
  .description('Load demo money-flow entries (replaces existing)')
  .option('--db <path>', 'SQLite path', process.env.MONIFLOW_DB ?? 'data/moniflow.db')
  .action((opts: { db: string }) => {
    const db = initDb(opts.db);
    ensureEntriesTable(db);
    const n = seedEntries(db);
    console.log(`seeded ${n} demo entries — run \`npm run dev:web\` and open /dashboard`);
  });

program.parse();
