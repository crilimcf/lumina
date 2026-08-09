import cron from 'node-cron';
import { q, tx } from '../db.js';
import { removeObject } from '../lib/storage.js';
import { uploadReferenceCount, removeUploadIfUnreferenced } from '../lib/uploads.js';

export async function purgeMessages() {
  const { rows } = await q(
    `SELECT id, media_url FROM messages
     WHERE purged_at IS NULL AND expires_at IS NOT NULL AND expires_at < now()
     ORDER BY expires_at LIMIT 500`
  );

  let purged = 0;
  for (const message of rows) {
    const url = message.media_url;
    try {
      if (url) {
        const { rows: uploads } = await q('SELECT key, purpose FROM uploads WHERE url = $1', [url]);
        const upload = uploads[0];
        if (upload) {
          const refs = await uploadReferenceCount(url);
          if (upload.purpose === 'message' || refs <= 1) await removeObject(upload.key);
        }
      }

      const { rowCount } = await q(
        `UPDATE messages
         SET body = NULL, media_url = NULL, purged_at = now()
         WHERE id = $1 AND purged_at IS NULL`,
        [message.id]
      );
      if (!rowCount) continue;
      if (url) await removeUploadIfUnreferenced(url).catch(err => console.error('[mensagens] media órfão fica para retry:', err.message));
      purged++;
    } catch (err) {
      console.error(`[mensagens] falhou apagar ${message.id}:`, err.message);
    }
  }
  if (purged) console.log(`[mensagens] ${purged} apagadas`);
  return purged;
}

export async function purgeMoments() {
  const { rows } = await q(`SELECT id, media_url FROM moments WHERE expires_at < now() ORDER BY expires_at LIMIT 500`);
  let purged = 0;
  for (const moment of rows) {
    const url = moment.media_url;
    try {
      if (url) {
        const { rows: uploads } = await q('SELECT key, purpose FROM uploads WHERE url = $1', [url]);
        const upload = uploads[0];
        if (upload) {
          const refs = await uploadReferenceCount(url);
          if (upload.purpose === 'moment' || refs <= 1) await removeObject(upload.key);
        }
      }
      const { rowCount } = await q('DELETE FROM moments WHERE id = $1 AND expires_at < now()', [moment.id]);
      if (!rowCount) continue;
      if (url) await removeUploadIfUnreferenced(url).catch(err => console.error('[momentos] media órfão fica para retry:', err.message));
      purged++;
    } catch (err) {
      console.error(`[momentos] falhou apagar ${moment.id}:`, err.message);
    }
  }
  if (purged) console.log(`[momentos] ${purged} expirados`);
  return purged;
}

export async function purgeStaleUploads() {
  const { rows } = await q(
    `SELECT id, key FROM uploads
     WHERE confirmed_at IS NULL AND created_at < now() - interval '2 hours'
     ORDER BY created_at LIMIT 500`
  );
  let removed = 0;
  for (const upload of rows) {
    try {
      await removeObject(upload.key);
      await q('DELETE FROM uploads WHERE id = $1 AND confirmed_at IS NULL', [upload.id]);
      removed++;
    } catch (err) { console.error(`[uploads] falhou a limpar ${upload.key}:`, err.message); }
  }
  if (removed) console.log(`[uploads] ${removed} uploads incompletos removidos`);
  return removed;
}

export async function purgeOrphanUploads() {
  const { rows } = await q(
    `SELECT id, key, url FROM uploads
     WHERE confirmed_at IS NOT NULL
       AND created_at < now() - interval '2 hours'
     ORDER BY created_at LIMIT 500`
  );
  let removed = 0;
  for (const upload of rows) {
    try {
      if (await uploadReferenceCount(upload.url)) continue;
      await removeObject(upload.key);
      const { rowCount } = await q(
        `DELETE FROM uploads WHERE id = $1
         AND NOT EXISTS (SELECT 1 FROM users WHERE avatar_url = $2)
         AND NOT EXISTS (SELECT 1 FROM posts WHERE media_url = $2)
         AND NOT EXISTS (SELECT 1 FROM moments WHERE media_url = $2)
         AND NOT EXISTS (SELECT 1 FROM messages WHERE media_url = $2)
         AND NOT EXISTS (SELECT 1 FROM rooms WHERE image_url = $2)`,
        [upload.id, upload.url]
      );
      removed += rowCount;
    } catch (err) { console.error(`[uploads] órfão ${upload.key} fica para retry:`, err.message); }
  }
  if (removed) console.log(`[uploads] ${removed} órfãos removidos`);
  return removed;
}

export async function runAccountDeletions() {
  const { rows } = await q(`SELECT user_id FROM deletion_requests WHERE cancelled_at IS NULL AND execute_at < now()`);
  let deleted = 0;
  for (const r of rows) {
    try {
      const { rows: files } = await q('SELECT key, url FROM uploads WHERE owner_id = $1', [r.user_id]);
      for (const file of files) await removeObject(file.key);
      const urls = files.map(file => file.url);

      await tx(async (c) => {
        if (urls.length) {
          await c.query('UPDATE posts SET media_url = NULL WHERE author_id <> $1 AND media_url = ANY($2::text[])', [r.user_id, urls]);
          await c.query('UPDATE messages SET media_url = NULL WHERE sender_id <> $1 AND media_url = ANY($2::text[])', [r.user_id, urls]);
          await c.query('UPDATE moments SET media_url = NULL WHERE author_id <> $1 AND media_url = ANY($2::text[])', [r.user_id, urls]);
          await c.query('UPDATE users SET avatar_url = NULL WHERE id <> $1 AND avatar_url = ANY($2::text[])', [r.user_id, urls]);
          await c.query('UPDATE rooms SET image_url = NULL WHERE creator_id <> $1 AND image_url = ANY($2::text[])', [r.user_id, urls]);
        }
        await c.query('DELETE FROM users WHERE id = $1', [r.user_id]);
      });

      deleted++;
      console.log(`[rgpd] conta apagada: ${r.user_id}`);
    } catch (err) {
      console.error(`[rgpd] falhou apagar ${r.user_id}; fica pendente para nova tentativa:`, err.message);
    }
  }
  return deleted;
}

export async function purgeExpiredTokens() {
  const { rowCount } = await q(`DELETE FROM password_resets WHERE expires_at < now() - interval '7 days'`);
  if (rowCount) console.log(`[tokens] ${rowCount} pedidos de recuperação expirados removidos`);
  return rowCount;
}

export async function purgeOldLoginAttempts() {
  const { rowCount } = await q(`DELETE FROM login_attempts WHERE created_at < now() - interval '90 days'`);
  if (rowCount) console.log(`[login] ${rowCount} tentativas antigas removidas`);
  return rowCount;
}

export function startJobs() {
  if (process.env.RUN_JOBS_IN_PROCESS === 'false') {
    console.log('[jobs] desligados neste processo — a correr como cron externo');
    return;
  }
  cron.schedule('* * * * *', () => purgeMessages().catch(console.error));
  cron.schedule('15 * * * *', () => purgeMoments().catch(console.error));
  cron.schedule('35 * * * *', () => purgeStaleUploads().catch(console.error));
  cron.schedule('45 * * * *', () => purgeOrphanUploads().catch(console.error));
  cron.schedule('10 3 * * *', () => runAccountDeletions().catch(console.error));
  cron.schedule('20 3 * * *', () => purgeExpiredTokens().catch(console.error));
  cron.schedule('30 3 * * *', () => purgeOldLoginAttempts().catch(console.error));
  console.log('[jobs] agendados');
}
