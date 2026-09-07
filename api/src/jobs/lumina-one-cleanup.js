import cron from 'node-cron';
import { q } from '../db.js';
import { removeUploadIfUnreferenced } from '../lib/uploads.js';
import { oneRoutes } from '../routes/one.js';
import { oneViralRoutes } from '../routes/one-viral.js';

// O servidor já monta oneRoutes em /one e /api/one. A extensão social é
// agregada aqui uma única vez para manter o contrato público de Lumina One.
oneRoutes.use(oneViralRoutes);

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

export async function purgeExpiredSocialLoops() {
  const { rows: chains } = await q(
    `SELECT c.id,e.media_url
       FROM viral_lume_chains c
       LEFT JOIN viral_lume_entries e ON e.chain_id=c.id
      WHERE c.recap_until<=now()
      ORDER BY c.recap_until
      LIMIT 1000`
  ).catch(error => {
    // Durante rollout, um processo antigo pode arrancar antes da migration 039.
    if (error?.code === '42P01') return { rows:[] };
    throw error;
  });

  const grouped = new Map();
  for (const row of chains) {
    if (!grouped.has(row.id)) grouped.set(row.id, new Set());
    if (row.media_url) grouped.get(row.id).add(row.media_url);
  }

  let removedChains = 0;
  for (const [chainId, media] of grouped) {
    const { rowCount } = await q('DELETE FROM viral_lume_chains WHERE id=$1 AND recap_until<=now()', [chainId]);
    if (!rowCount) continue;
    removedChains += rowCount;
    for (const url of media) {
      await removeUploadIfUnreferenced(url)
        .catch(error => console.error(`[lume-2] media órfão fica para retry: ${error.message}`));
    }
  }

  const agora = await q(
    `DELETE FROM agora_intents
      WHERE expires_at<=now()
         OR (status<>'open' AND created_at<now()-interval '1 day')`
  ).catch(error => {
    if (error?.code === '42P01') return { rowCount:0 };
    throw error;
  });

  if (removedChains || agora.rowCount) {
    console.log(`[social-loops] ${removedChains} Lumes coletivos e ${agora.rowCount} planos Agora limpos`);
  }
  return { removedChains, removedAgora:agora.rowCount };
}

export function startLuminaOneJobs() {
  if (process.env.RUN_JOBS_IN_PROCESS === 'false') return;
  cron.schedule('*/5 * * * *', () => Promise.all([
    purgeExpiredLumes(),
    purgeExpiredSocialLoops(),
  ]).catch(console.error));
  console.log('[lumina-one] limpeza de Lumes e loops sociais agendada');
}
