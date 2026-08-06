#!/usr/bin/env node
/**
 * Trabalhos periódicos, para correr como processo separado.
 *
 * Existe porque num plano gratuito o serviço web adormece por inatividade —
 * e um processo adormecido não corre cron nenhum. A comunidade acordava sem
 * convite e ninguém dava por isso durante dias.
 *
 * Faz o que tem a fazer e sai. Pensado para o Cron Job do Render ou
 * equivalente:
 *
 *   node scripts/cron.js invites    de hora a hora
 *   node scripts/cron.js purge      de cinco em cinco minutos
 *   node scripts/cron.js deletions  uma vez por dia
 *   node scripts/cron.js all        tudo de uma vez
 */
import { pool, q } from '../src/db.js';
import { rotateInvites, purgeMessages, purgeMoments } from '../src/jobs/daily.js';

/** Executa os apagamentos de conta cujo prazo de arrependimento já passou. */
async function runDeletions() {
  const { rows } = await q(
    `SELECT user_id FROM deletion_requests
     WHERE cancelled_at IS NULL AND execute_at < now()`
  );
  for (const r of rows) {
    // ON DELETE CASCADE trata do resto: posts, mensagens, votos, tudo.
    await q('DELETE FROM users WHERE id = $1', [r.user_id]);
    console.log(`[rgpd] conta apagada: ${r.user_id}`);
  }
  return rows.length;
}

/** Limpa tokens de recuperação já expirados. */
async function cleanTokens() {
  const { rowCount } = await q(
    `DELETE FROM password_resets WHERE expires_at < now() - interval '7 days'`
  );
  return rowCount;
}

const TASKS = {
  invites: rotateInvites,
  purge: async () => (await purgeMessages()) + (await purgeMoments()),
  deletions: runDeletions,
  tokens: cleanTokens,
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
