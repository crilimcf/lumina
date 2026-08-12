import cron from 'node-cron';
import { q } from '../db.js';
import { removeUploadIfUnreferenced } from '../lib/uploads.js';

export async function purgeExpiredLumes() {
  const { rows } = await q(
    `SELECT id,media_url FROM lumes
      WHERE expires_at<=now()
      ORDER BY expires_at
      LIMIT 500`
  );

  let removed = 0;
  for (const lume of rows) {
    try {
      const { rowCount } = await q(
        'DELETE FROM lumes WHERE id=$1 AND expires_at<=now()',
        [lume.id]
      );
      if (!rowCount) continue;
      if (lume.media_url) {
        await removeUploadIfUnreferenced(lume.media_url)
          .catch(error => console.error(`[lumes] media órfão fica para retry: ${error.message}`));
      }
      removed += rowCount;
    } catch (error) {
      console.error(`[lumes] falhou expirar ${lume.id}:`, error.message);
    }
  }
  if (removed) console.log(`[lumes] ${removed} expirados e removidos`);

  await q('DELETE FROM lume_media_tickets WHERE expires_at<now() OR consumed_at<now()-interval \'10 minutes\'')
    .catch(error => console.error('[lumes] falhou limpar tickets:', error.message));
  return removed;
}

export function startLuminaOneJobs() {
  if (process.env.RUN_JOBS_IN_PROCESS === 'false') return;
  cron.schedule('*/5 * * * *', () => purgeExpiredLumes().catch(console.error));
  console.log('[lumina-one] limpeza de Lumes agendada');
}
