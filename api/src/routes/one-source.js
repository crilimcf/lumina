import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, bad, notFound } from '../middleware/auth.js';

export const oneSourceRoutes = Router();
const SOURCE_TYPES = new Set(['post','radar','live']);

async function visibleSource(userId, sourceType, sourceId) {
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
      [userId, sourceId]
    );
    return rows[0] ? { type:'post', ...rows[0] } : null;
  }

  if (sourceType === 'radar') {
    const { rows } = await q(
      `SELECT id,title,summary,body,image_url,external_url,source_name,region,tags,starts_at,ends_at,published_at
         FROM radar_items
        WHERE id::text=$1 AND status='published' AND published_at<=now()
          AND (ends_at IS NULL OR ends_at>now())`,
      [sourceId]
    );
    return rows[0] ? { type:'radar', ...rows[0] } : null;
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
    [userId, sourceId]
  );
  return rows[0] ? { type:'live', ...rows[0] } : null;
}

oneSourceRoutes.get('/source/:sourceType/:sourceId', auth, h(async (req, res) => {
  const sourceType = String(req.params.sourceType || '').toLowerCase();
  const sourceId = String(req.params.sourceId || '');
  if (!SOURCE_TYPES.has(sourceType) || !sourceId) throw bad('Fonte inválida');
  const source = await visibleSource(req.user.id, sourceType, sourceId);
  if (!source) throw notFound('Conteúdo não encontrado');
  res.json(source);
}));

// Esta rota fica antes do router principal /one. Assim, um convite Juntos só
// cria membership se o convidado ainda tiver autorização para ver a fonte.
oneSourceRoutes.post('/together/:sessionId/join', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT id,host_id,source_type,source_id,title,state,created_at,updated_at,expires_at
       FROM together_sessions WHERE id::text=$1 AND expires_at>now()`,
    [String(req.params.sessionId || '')]
  );
  const session = rows[0];
  if (!session) throw notFound('Sessão não encontrada');
  const source = await visibleSource(req.user.id, session.source_type, session.source_id);
  if (!source) throw notFound('Sessão não encontrada');
  await q(
    `INSERT INTO together_members (session_id,user_id) VALUES ($1,$2)
     ON CONFLICT DO NOTHING`,
    [session.id, req.user.id]
  );
  res.json(session);
}));
