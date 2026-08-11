import { q } from '../db.js';
import { removeObject } from './storage.js';

/** Reserva atomicamente um upload confirmado para um único conteúdo. */
export async function claimUpload(url, ownerId, purpose, query = q, { allowVideo = false } = {}) {
  if (!url) return null;
  const { rows } = await query(
    `UPDATE uploads
     SET consumed_at = now(), purpose = $3
     WHERE url = $1 AND owner_id = $2
       AND confirmed_at IS NOT NULL AND consumed_at IS NULL
       AND ($4::boolean OR mime NOT LIKE 'video/%')
     RETURNING id, key, url, mime`,
    [url, ownerId, purpose, allowVideo]
  );
  return rows[0] || null;
}

/** Conta referências a media, incluindo salas e conteúdo derivado. */
export async function uploadReferenceCount(url, query = q) {
  if (!url) return 0;
  const { rows } = await query(
    `SELECT (
       (SELECT count(*) FROM users         WHERE avatar_url = $1) +
       (SELECT count(*) FROM posts         WHERE media_url = $1) +
       (SELECT count(*) FROM moments       WHERE media_url = $1) +
       (SELECT count(*) FROM messages      WHERE media_url = $1) +
       (SELECT count(*) FROM rooms         WHERE image_url = $1) +
       (SELECT count(*) FROM room_messages WHERE media_url = $1)
     )::int AS n`,
    [url]
  );
  return rows[0]?.n ?? 0;
}

export async function removeUploadIfUnreferenced(url) {
  if (!url) return false;
  if (await uploadReferenceCount(url)) return false;

  const { rows } = await q('SELECT id, key FROM uploads WHERE url = $1', [url]);
  const upload = rows[0];
  if (!upload) return false;

  await removeObject(upload.key);
  if (await uploadReferenceCount(url)) return false;
  await q('DELETE FROM uploads WHERE id = $1', [upload.id]);
  return true;
}

export async function removeClaimedUploadIfUnreferenced(url, purpose) {
  if (!url) return false;
  const { rows } = await q('SELECT purpose FROM uploads WHERE url = $1 AND consumed_at IS NOT NULL', [url]);
  if (!rows[0] || rows[0].purpose !== purpose) return removeUploadIfUnreferenced(url);
  return removeUploadIfUnreferenced(url);
}
