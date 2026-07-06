import 'dotenv/config';
import { Command } from 'commander';
import { initDb } from './db/client';
import { entries } from './db/schema';

const program = new Command();
program.name('moniflow').description('Personal money-flow dashboard CLI');

program
  .command('summary')
  .description('Print net flow across all entries')
  .option('--db <path>', 'SQLite path', process.env.MONIFLOW_DB ?? 'data/moniflow.db')
  .action((opts: { db: string }) => {
    const db = initDb(opts.db);
    const rows = db.select().from(entries).all();
    const net = rows.reduce((sum, r) => sum + r.amount, 0);
    console.log(`${rows.length} entries · net ฿${new Intl.NumberFormat('en-US').format(net)}`);
  });

program.parse();
