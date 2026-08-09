#!/usr/bin/env node
/** Trabalhos periódicos para correr como processo separado. */
import { pool } from '../src/db.js';
import {
  purgeMessages, purgeMoments, purgeStaleUploads, purgeOrphanUploads,
  runAccountDeletions, purgeExpiredTokens, purgeOldLoginAttempts,
} from '../src/jobs/daily.js';

const TASKS = {
  purge: async () =>
    (await purgeMessages()) +
    (await purgeMoments()) +
    (await purgeStaleUploads()) +
    (await purgeOrphanUploads()),
  deletions: runAccountDeletions,
  tokens: async () => (await purgeExpiredTokens()) + (await purgeOldLoginAttempts()),
};

const args = process.argv.slice(2);
const names = args.length === 0 || args[0] === 'all' ? Object.keys(TASKS) : args;
const unknown = names.filter(n => !TASKS[n]);
if (unknown.length) {
  console.error(`Tarefa desconhecida: ${unknown.join(', ')}`);
  console.error(`Usa: ${Object.keys(TASKS).join(', ')} ou all`);
  process.exit(1);
}

let failed = false;
for (const name of names) {
  const t0 = Date.now();
  try {
    const n = await TASKS[name]();
    console.log(`[cron] ${name}: ${n ?? 0} · ${Date.now() - t0} ms`);
  } catch (err) {
    failed = true;
    console.error(`[cron] ${name} falhou:`, err.message);
  }
}

await pool.end();
process.exit(failed ? 1 : 0);
