import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, bad, notFound } from '../middleware/auth.js';

export const oneSourceRoutes = Router();

oneSourceRoutes.get('/:sourceType/:sourceId', auth, h(async (req, res) => {
  const sourceType = String(req.params.sourceType || '').toLowerCase();
  const sourceId = String(req.params.sourceId || '');
  if (!['post','radar','live'].includes(sourceType) || !sourceId) throw bad('Fonte inválida');

  if (sourceType === 'post') {
    const { rows } = await q(
      `SELECT p.id,p.body,p.media_url,
              (SELECT up.mime FROM uploads up WHERE up.url=p.media_url LIMIT 1) AS media_mime,
              p.created_at,u.id AS author_id,u.name,u.handle,u.palette AS author_palette,u.avatar_url AS author_avatar_url
         FROM posts p JOIN users u ON u.id=p.author_id AND u.suspended_at IS NULL
        WHERE p.id::text=$2 AND p.hidden_at IS NULL AND COALESCE(p.kind,'post')='post'
          AND (p.author_id=$1 OR u.is_private=false OR EXISTS (
                SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=p.author_id
              ))
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE
                (b.blocker_id=$1 AND b.blocked_id=p.author_id) OR
                (b.blocked_id=$1 AND b.blocker_id=p.author_id))`,
      [req.user.id, sourceId]
    );
    if (!rows[0]) throw notFound('Publicação não encontrada');
    return res.json({ type:'post', ...rows[0] });
  }

  if (sourceType === 'radar') {
    const { rows } = await q(
      `SELECT id,title,summary,body,image_url,external_url,source_name,region,tags,starts_at,ends_at,published_at
         FROM radar_items
        WHERE id::text=$1 AND status='published' AND published_at<=now()
          AND (ends_at IS NULL OR ends_at>now())`,
      [sourceId]
    );
    if (!rows[0]) throw notFound('Conteúdo Radar não encontrado');
    return res.json({ type:'radar', ...rows[0] });
  }

  const { rows } = await q(
    `SELECT ls.id,ls.title,ls.status,ls.privacy,ls.playback_url,ls.recording_url,ls.recording_mime,
            ls.creator_id,u.name,u.handle,u.palette AS author_palette,u.avatar_url AS author_avatar_url
       FROM live_streams ls JOIN users u ON u.id=ls.creator_id AND u.suspended_at IS NULL
      WHERE ls.id::text=$2 AND (
        ls.creator_id=$1 OR (
          NOT EXISTS (SELECT 1 FROM blocks b WHERE
            (b.blocker_id=$1 AND b.blocked_id=ls.creator_id) OR
            (b.blocked_id=$1 AND b.blocker_id=ls.creator_id))
          AND (ls.privacy='public' OR EXISTS (
            SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=ls.creator_id
          ))
        )
      )`,
    [req.user.id, sourceId]
  );
  if (!rows[0]) throw notFound('Direto não encontrado');
  res.json({ type:'live', ...rows[0] });
}));
