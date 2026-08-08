#!/usr/bin/env node
/**
 * Trabalhos periódicos, para correr como processo separado.
 *
 * Existe porque num plano gratuito o serviço web adormece por inatividade —
 * e um processo adormecido não corre cron nenhum. A comunidade acordava sem
 * convite e ninguém dava por isso durante dias.
 *
 * Faz o que tem a fazer e sai. No Railway os trabalhos correm dentro do
 * processo da API e isto nao e preciso — fica para quem alojar num sitio que
 * hiberne, ou para correr uma tarefa a mao:
 *
 *   node scripts/cron.js invites    de hora a hora
 *   node scripts/cron.js purge      de cinco em cinco minutos
 *   node scripts/cron.js deletions  uma vez por dia
 *   node scripts/cron.js all        tudo de uma vez
 */
import { pool } from '../src/db.js';
import {
  rotateInvites, purgeMessages, purgeMoments, purgeStaleUploads,
  runAccountDeletions, purgeExpiredTokens, purgeOldLoginAttempts,
} from '../src/jobs/daily.js';

const TASKS = {
  invites: rotateInvites,
  purge: async () => (await purgeMessages()) + (await purgeMoments()) + (await purgeStaleUploads()),
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
    // Uma tarefa a falhar não impede as outras de correr.
    failed = true;
    console.error(`[cron] ${name} falhou:`, err.message);
  }
}

await pool.end();
process.exit(failed ? 1 : 0);
