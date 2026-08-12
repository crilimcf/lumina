import crypto from 'node:crypto';
import { Router } from 'express';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import { signedUploadUrl } from '../lib/storage.js';
import { auth, h, bad, notFound, forbidden } from '../middleware/auth.js';

export const oneSourceRoutes = Router();
const SOURCE_TYPES = new Set(['post','radar','live']);
const LUME_TICKET_TTL_SECONDS = 45;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

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

// O POST de abertura marca imediatamente o Lume como visto e devolve apenas
// uma rota interna com ticket descartável. O URL público do objeto nunca é
// exposto ao destinatário.
oneSourceRoutes.post('/lumes/:lumeId/open', auth, h(async (req, res) => {
  const lumeId = String(req.params.lumeId || '');
  const ticket = crypto.randomBytes(24).toString('base64url');
  const tokenHash = sha256(ticket);

  const opened = await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT l.id,l.author_id,l.media_url,l.effect,l.expires_at,
              up.key AS media_key,up.mime AS media_mime
         FROM lumes l
         LEFT JOIN uploads up ON up.url=l.media_url
        WHERE l.id::text=$1 AND l.expires_at>now()
        FOR UPDATE OF l`,
      [lumeId]
    );
    const lume = rows[0];
    if (!lume) throw notFound('Lume não encontrado');
    if (lume.author_id === req.user.id) return { ...lume, mine:true, own_media_url:lume.media_url };

    const { rows: access } = await c.query(
      `SELECT
        (EXISTS (SELECT 1 FROM follows f1 WHERE f1.follower_id=$1 AND f1.following_id=$2)
         AND EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_id=$2 AND f2.following_id=$1)) AS mutual,
        NOT EXISTS (SELECT 1 FROM blocks b WHERE
          (b.blocker_id=$1 AND b.blocked_id=$2) OR
          (b.blocked_id=$1 AND b.blocker_id=$2)) AS unblocked`,
      [req.user.id, lume.author_id]
    );
    if (!access[0]?.mutual || !access[0]?.unblocked) throw forbidden('Este Lume não está disponível para ti');

    const inserted = await c.query(
      `INSERT INTO lume_views (lume_id,user_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING RETURNING viewed_at`,
      [lume.id, req.user.id]
    );
    if (!inserted.rowCount) {
      const error = bad('Este Lume já foi visto', 'lume_already_viewed');
      error.status = 410;
      throw error;
    }

    await c.query(
      `INSERT INTO lume_media_tickets (token_hash,lume_id,user_id,expires_at)
       VALUES ($1,$2,$3,now()+($4::text || ' seconds')::interval)`,
      [tokenHash, lume.id, req.user.id, String(LUME_TICKET_TTL_SECONDS)]
    );
    return { ...lume, mine:false, viewed_at:inserted.rows[0].viewed_at };
  });

  if (opened.mine) {
    return res.json({ ...opened, media_url:opened.own_media_url, own_media_url:undefined, media_key:undefined });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    id:opened.id,
    author_id:opened.author_id,
    effect:opened.effect,
    expires_at:opened.expires_at,
    media_mime:opened.media_mime,
    viewed_at:opened.viewed_at,
    mine:false,
    media_url:`/api/one/lumes/${opened.id}/media/${ticket}`,
  });
}));

// O primeiro pedido ao ticket consome-o atomicamente antes de tocar no storage.
// Repetições, partilhas ou refresh do mesmo URL recebem 410.
oneSourceRoutes.get('/lumes/:lumeId/media/:ticket', auth, h(async (req, res) => {
  const tokenHash = sha256(String(req.params.ticket || ''));
  const lumeId = String(req.params.lumeId || '');

  const media = await tx(async (c) => {
    const claimed = await c.query(
      `UPDATE lume_media_tickets
          SET consumed_at=now()
        WHERE token_hash=$1 AND lume_id::text=$2 AND user_id=$3
          AND consumed_at IS NULL AND expires_at>now()
        RETURNING lume_id`,
      [tokenHash, lumeId, req.user.id]
    );
    if (!claimed.rowCount) return null;
    const { rows } = await c.query(
      `SELECT up.key,up.mime
         FROM lumes l JOIN uploads up ON up.url=l.media_url
        WHERE l.id= $1 AND l.expires_at>now()`,
      [claimed.rows[0].lume_id]
    );
    return rows[0] || null;
  });

  if (!media) {
    res.status(410).setHeader('Cache-Control', 'no-store');
    return res.end();
  }

  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!env.S3_BUCKET) return res.status(204).end();

  let upstream;
  try {
    const storageUrl = await signedUploadUrl(media.key, media.mime, 60, 'GET');
    upstream = await fetch(storageUrl, { signal:AbortSignal.timeout(10_000) });
  } catch {
    return res.status(502).end();
  }
  if (!upstream.ok || !upstream.body) return res.status(502).end();
  res.setHeader('Content-Type', media.mime || upstream.headers.get('content-type') || 'application/octet-stream');
  const length = upstream.headers.get('content-length');
  if (length) res.setHeader('Content-Length', length);
  for await (const chunk of upstream.body) res.write(chunk);
  res.end();
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

// Para sessões em reprodução contínua, deriva a posição corrente a partir de
// positionMs + tempo decorrido desde a última alteração. Assim quem entra mais
// tarde não começa vários segundos atrás do anfitrião.
oneSourceRoutes.get('/together/:sessionId', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT s.*,(s.host_id=$2) AS mine
       FROM together_sessions s JOIN together_members m ON m.session_id=s.id
      WHERE s.id::text=$1 AND m.user_id=$2 AND s.expires_at>now()`,
    [String(req.params.sessionId || ''), req.user.id]
  );
  const session = rows[0];
  if (!session) throw notFound('Sessão não encontrada');

  const state = { ...(session.state || {}) };
  if (state.playing) {
    const changedAt = Date.parse(state.changedAt || session.updated_at || session.created_at);
    const elapsed = Number.isFinite(changedAt) ? Math.max(0, Date.now() - changedAt) : 0;
    state.positionMs = Math.max(0, Math.min(86_400_000, Number(state.positionMs || 0) + elapsed));
  }

  const members = await q(
    `SELECT u.id,u.handle,u.name,u.palette,u.avatar_url,m.joined_at
       FROM together_members m JOIN users u ON u.id=m.user_id
      WHERE m.session_id=$1 ORDER BY m.joined_at`,
    [session.id]
  );
  res.json({ ...session, state, members:members.rows });
}));
