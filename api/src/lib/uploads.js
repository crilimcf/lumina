import { q } from '../db.js';
import { removeObject } from './storage.js';

/**
 * Reserva atomicamente um upload confirmado para um único conteúdo criado pelo
 * utilizador. A mesma URL deixa de poder ser reutilizada manualmente noutro
 * post/momento/mensagem/avatar.
 *
 * `query` tem a mesma assinatura de q(); numa transação passa-se
 * `(text, params) => client.query(text, params)` para o claim fazer parte do
 * mesmo COMMIT que cria o conteúdo.
 */
export async function claimUpload(url, ownerId, purpose, query = q) {
  if (!url) return null;
  const { rows } = await query(
    `UPDATE uploads
     SET consumed_at = now(), purpose = $3
     WHERE url = $1 AND owner_id = $2
       AND confirmed_at IS NOT NULL AND consumed_at IS NULL
     RETURNING id, key, url`,
    [url, ownerId, purpose]
  );
  return rows[0] || null;
}

/**
 * Diz se ainda existe conteúdo a apontar para um URL guardado. Inclui as
 * referências derivadas pelo servidor, como reposts.
 */
export async function uploadReferenceCount(url, query = q) {
  if (!url) return 0;
  const { rows } = await query(
    `SELECT (
       (SELECT count(*) FROM users    WHERE avatar_url = $1) +
       (SELECT count(*) FROM posts    WHERE media_url = $1) +
       (SELECT count(*) FROM moments  WHERE media_url = $1) +
       (SELECT count(*) FROM messages WHERE media_url = $1)
     )::int AS n`,
    [url]
  );
  return rows[0]?.n ?? 0;
}

/**
 * Remove o objeto físico e a linha de uploads apenas quando já não existe
 * nenhuma referência na aplicação. Se o storage falhar, deixa a linha para o
 * job de órfãos tentar novamente.
 */
export async function removeUploadIfUnreferenced(url) {
  if (!url) return false;
  if (await uploadReferenceCount(url)) return false;

  const { rows } = await q('SELECT id, key FROM uploads WHERE url = $1', [url]);
  const upload = rows[0];
  if (!upload) return false;

  await removeObject(upload.key);

  // Confirma de novo depois do I/O externo. Uploads consumidos não podem ser
  // reclamados novamente pela API, mas esta segunda leitura também protege
  // dados legacy e referências derivadas que possam ter surgido entretanto.
  if (await uploadReferenceCount(url)) return false;
  await q('DELETE FROM uploads WHERE id = $1', [upload.id]);
  return true;
}

/**
 * Apaga fisicamente um upload que sabemos pertencer exclusivamente ao tipo de
 * conteúdo indicado. Só é usado para uploads novos (não legacy) e depois de a
 * referência do conteúdo ter sido removida da base.
 */
export async function removeClaimedUploadIfUnreferenced(url, purpose) {
  if (!url) return false;
  const { rows } = await q(
    'SELECT purpose FROM uploads WHERE url = $1 AND consumed_at IS NOT NULL', [url]
  );
  if (!rows[0] || rows[0].purpose !== purpose) return removeUploadIfUnreferenced(url);
  return removeUploadIfUnreferenced(url);
}
