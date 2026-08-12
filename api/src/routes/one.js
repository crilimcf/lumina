import { Router } from 'express';
import { q, tx } from '../db.js';
import { auth, h, bad, notFound, forbidden } from '../middleware/auth.js';
import { claimUpload, removeUploadIfUnreferenced } from '../lib/uploads.js';

export const oneRoutes = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LUME_EFFECTS = new Set(['normal', 'mirror', 'mono', 'vivid']);
const CONTEXT_MODES = new Set(['auto', 'casa', 'evento', 'viagem', 'jogo', 'foco']);
const TOGETHER_TYPES = new Set(['post', 'radar', 'live']);

const validUuid = (value) => UUID_RE.test(String(value || ''));
const cleanText = (value, max = 120) => String(value || '').trim().slice(0, max);
const cleanTopics = (value) => {
  if (!Array.isArray(value)) throw bad('Tópicos inválidos', 'bad_topics');
  return [...new Set(value.map(v => String(v).trim().toLowerCase()).filter(Boolean))].slice(0, 12);
};

async function getPreferences(userId) {
  const { rows } = await q(
    `SELECT boost_topics, mute_topics, context_mode, local_region, updated_at
       FROM pulse_preferences WHERE user_id=$1`,
    [userId]
  );
  return rows[0] || { boost_topics: [], mute_topics: [], context_mode: 'auto', local_region: null, updated_at: null };
}

function blockedWhere(viewerExpr, authorExpr) {
  return `NOT EXISTS (
    SELECT 1 FROM blocks b
     WHERE (b.blocker_id=${viewerExpr} AND b.blocked_id=${authorExpr})
        OR (b.blocked_id=${viewerExpr} AND b.blocker_id=${authorExpr})
  )`;
}

function mutualWhere(viewerExpr, authorExpr) {
  return `EXISTS (SELECT 1 FROM follows f1 WHERE f1.follower_id=${viewerExpr} AND f1.following_id=${authorExpr})
      AND EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_id=${authorExpr} AND f2.following_id=${viewerExpr})`;
}

// ---- Lumes ---------------------------------------------------------------
oneRoutes.get('/lumes', auth, h(async (req, res) => {
  await q('DELETE FROM lumes WHERE expires_at <= now()');
  const { rows } = await q(
    `SELECT l.id, l.author_id, l.effect, l.created_at, l.expires_at,
            u.handle, u.name, u.palette, u.avatar_url,
            (l.author_id=$1) AS mine,
            EXISTS (SELECT 1 FROM lume_views v WHERE v.lume_id=l.id AND v.user_id=$1) AS viewed,
            CASE WHEN l.author_id=$1 THEN l.media_url ELSE NULL END AS media_url,
            CASE WHEN l.author_id=$1 THEN (SELECT up.mime FROM uploads up WHERE up.url=l.media_url LIMIT 1) ELSE NULL END AS media_mime
       FROM lumes l
       JOIN users u ON u.id=l.author_id AND u.suspended_at IS NULL
      WHERE l.expires_at > now()
        AND (
          l.author_id=$1 OR (
            ${mutualWhere('$1', 'l.author_id')}
            AND ${blockedWhere('$1', 'l.author_id')}
            AND NOT EXISTS (SELECT 1 FROM lume_views v WHERE v.lume_id=l.id AND v.user_id=$1)
          )
        )
      ORDER BY l.created_at DESC
      LIMIT 60`,
    [req.user.id]
  );
  res.json(rows);
}));

oneRoutes.post('/lumes', auth, h(async (req, res) => {
  const mediaUrl = String(req.body?.mediaUrl || '').trim();
  const effect = String(req.body?.effect || 'normal').trim().toLowerCase();
  if (!mediaUrl) throw bad('Tira uma fotografia para criar um Lume', 'missing_media');
  if (!LUME_EFFECTS.has(effect)) throw bad('Efeito inválido', 'bad_effect');

  const lume = await tx(async (c) => {
    const claimed = await claimUpload(mediaUrl, req.user.id, 'lume', (text, params) => c.query(text, params), { allowVideo: false });
    if (!claimed) throw bad('Fotografia não verificada ou já utilizada', 'unconfirmed_upload');
    const { rows } = await c.query(
      `INSERT INTO lumes (author_id,media_url,effect)
       VALUES ($1,$2,$3)
       RETURNING id,author_id,media_url,effect,created_at,expires_at`,
      [req.user.id, mediaUrl, effect]
    );
    return { ...rows[0], media_mime: claimed.mime, mine: true, viewed: false };
  });
  res.status(201).json(lume);
}));

oneRoutes.post('/lumes/:lumeId/open', auth, h(async (req, res) => {
  if (!validUuid(req.params.lumeId)) throw notFound('Lume não encontrado');
  const opened = await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT l.id,l.author_id,l.media_url,l.effect,l.expires_at,
              (SELECT up.mime FROM uploads up WHERE up.url=l.media_url LIMIT 1) AS media_mime
         FROM lumes l
        WHERE l.id=$1 AND l.expires_at>now()
        FOR UPDATE`,
      [req.params.lumeId]
    );
    const lume = rows[0];
    if (!lume) throw notFound('Lume não encontrado');
    if (lume.author_id === req.user.id) return { ...lume, mine: true };

    const { rows: access } = await c.query(
      `SELECT
        (${mutualWhere('$1', '$2')}) AS mutual,
        (${blockedWhere('$1', '$2')}) AS unblocked`,
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
    return { ...lume, mine: false, viewed_at: inserted.rows[0].viewed_at };
  });
  res.json(opened);
}));

oneRoutes.delete('/lumes/:lumeId', auth, h(async (req, res) => {
  if (!validUuid(req.params.lumeId)) throw notFound('Lume não encontrado');
  const { rows } = await q(
    'DELETE FROM lumes WHERE id=$1 AND author_id=$2 RETURNING media_url',
    [req.params.lumeId, req.user.id]
  );
  if (!rows[0]) throw notFound('Lume não encontrado');
  removeUploadIfUnreferenced(rows[0].media_url).catch(() => {});
  res.json({ deleted: true });
}));

// ---- Pulso + algoritmo ---------------------------------------------------
oneRoutes.get('/preferences', auth, h(async (req, res) => {
  res.json(await getPreferences(req.user.id));
}));

oneRoutes.patch('/preferences', auth, h(async (req, res) => {
  const current = await getPreferences(req.user.id);
  const boost = req.body?.boostTopics === undefined ? current.boost_topics : cleanTopics(req.body.boostTopics);
  const mute = req.body?.muteTopics === undefined ? current.mute_topics : cleanTopics(req.body.muteTopics);
  const context = req.body?.contextMode === undefined ? current.context_mode : String(req.body.contextMode || '').trim().toLowerCase();
  const localRegion = req.body?.localRegion === undefined ? current.local_region : cleanText(req.body.localRegion, 80) || null;
  if (!CONTEXT_MODES.has(context)) throw bad('Modo Agora inválido', 'bad_context');
  const filteredBoost = boost.filter(topic => !mute.includes(topic));

  const { rows } = await q(
    `INSERT INTO pulse_preferences (user_id,boost_topics,mute_topics,context_mode,local_region,updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (user_id) DO UPDATE SET
       boost_topics=EXCLUDED.boost_topics,
       mute_topics=EXCLUDED.mute_topics,
       context_mode=EXCLUDED.context_mode,
       local_region=EXCLUDED.local_region,
       updated_at=now()
     RETURNING boost_topics,mute_topics,context_mode,local_region,updated_at`,
    [req.user.id, filteredBoost, mute, context, localRegion]
  );
  res.json(rows[0]);
}));

oneRoutes.get('/pulse', auth, h(async (req, res) => {
  const scope = req.query.scope === 'friends' ? 'friends' : 'for-you';
  const prefs = await getPreferences(req.user.id);
  const { rows } = await q(
    `SELECT p.id,p.body,p.media_url,
            (SELECT up.mime FROM uploads up WHERE up.url=p.media_url LIMIT 1) AS media_mime,
            p.palette,p.created_at,p.edited_at,p.repost_of,
            u.id AS author_id,u.handle,u.name,u.palette AS author_palette,u.avatar_url AS author_avatar_url,
            EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=p.author_id) AS following,
            (SELECT count(*) FROM reactions r WHERE r.post_id=p.id AND r.kind='like')::int AS likes,
            (SELECT count(*) FROM reactions r WHERE r.post_id=p.id AND r.kind='fire')::int AS fires,
            (SELECT count(*) FROM comments c WHERE c.post_id=p.id AND c.hidden_at IS NULL)::int AS comments,
            (SELECT count(*) FROM posts rp WHERE rp.repost_of=p.id)::int AS reposts
       FROM posts p
       JOIN users u ON u.id=p.author_id AND u.suspended_at IS NULL
      WHERE p.hidden_at IS NULL
        AND COALESCE(p.kind,'post')='post'
        AND (p.author_id=$1 OR u.is_private=false OR EXISTS (
              SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=p.author_id
            ))
        AND ($2::boolean=false OR p.author_id=$1 OR EXISTS (
              SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=p.author_id
            ))
        AND ${blockedWhere('$1', 'p.author_id')}
      ORDER BY p.created_at DESC
      LIMIT 100`,
    [req.user.id, scope === 'friends']
  );

  const boosts = prefs.boost_topics || [];
  const mutes = prefs.mute_topics || [];
  const now = Date.now();
  const ranked = rows
    .map(post => {
      const text = String(post.body || '').toLowerCase();
      if (mutes.some(topic => text.includes(topic))) return null;
      const ageHours = Math.max(0, (now - new Date(post.created_at).getTime()) / 3_600_000);
      let score = Math.max(0, 18 - ageHours / 4);
      score += Math.min(16, (post.likes || 0) * .8 + (post.fires || 0) * 1.1 + (post.comments || 0) * .6 + (post.reposts || 0));
      if (post.following) score += 8;
      if (post.media_mime?.startsWith('video/')) score += 3;
      if (post.media_url) score += 1;
      score += boosts.reduce((sum, topic) => sum + (text.includes(topic) ? 12 : 0), 0);
      return { ...post, pulse_score: Math.round(score * 10) / 10 };
    })
    .filter(Boolean)
    .sort((a, b) => b.pulse_score - a.pulse_score || new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 35);

  res.json({ items: ranked, scope, preferences: prefs });
}));

// ---- Cápsulas ------------------------------------------------------------
oneRoutes.get('/capsules', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT c.id,c.owner_id,c.title,c.description,c.unlock_at,c.created_at,
            (c.unlock_at IS NOT NULL AND c.unlock_at>now()) AS locked,
            cm.role,
            (SELECT count(*)::int FROM capsule_members x WHERE x.capsule_id=c.id) AS member_count,
            (SELECT count(*)::int FROM capsule_items i WHERE i.capsule_id=c.id) AS item_count
       FROM capsules c
       JOIN capsule_members cm ON cm.capsule_id=c.id AND cm.user_id=$1
      ORDER BY c.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

oneRoutes.post('/capsules', auth, h(async (req, res) => {
  const title = cleanText(req.body?.title, 80);
  const description = cleanText(req.body?.description, 400);
  if (!title) throw bad('Dá um nome à Cápsula', 'missing_title');
  let unlockAt = null;
  if (req.body?.unlockAt) {
    const parsed = new Date(req.body.unlockAt);
    if (Number.isNaN(parsed.getTime())) throw bad('Data de abertura inválida', 'bad_unlock');
    unlockAt = parsed.toISOString();
  }
  const rawMembers = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];
  const memberIds = [...new Set(rawMembers.map(String).filter(id => validUuid(id) && id !== req.user.id))].slice(0, 20);

  const capsule = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO capsules (owner_id,title,description,unlock_at)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, title, description, unlockAt]
    );
    const created = rows[0];
    await c.query(
      `INSERT INTO capsule_members (capsule_id,user_id,role) VALUES ($1,$2,'owner')`,
      [created.id, req.user.id]
    );
    for (const userId of memberIds) {
      await c.query(
        `INSERT INTO capsule_members (capsule_id,user_id,role)
         SELECT $1,u.id,'member' FROM users u
          WHERE u.id=$2 AND u.suspended_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM blocks b WHERE
              (b.blocker_id=$3 AND b.blocked_id=u.id) OR (b.blocked_id=$3 AND b.blocker_id=u.id))
         ON CONFLICT DO NOTHING`,
        [created.id, userId, req.user.id]
      );
    }
    return created;
  });
  res.status(201).json({ ...capsule, locked: !!(capsule.unlock_at && new Date(capsule.unlock_at) > new Date()) });
}));

async function capsuleAccess(capsuleId, userId) {
  if (!validUuid(capsuleId)) return null;
  const { rows } = await q(
    `SELECT c.*,cm.role,(c.unlock_at IS NOT NULL AND c.unlock_at>now()) AS locked
       FROM capsules c JOIN capsule_members cm ON cm.capsule_id=c.id
      WHERE c.id=$1 AND cm.user_id=$2`,
    [capsuleId, userId]
  );
  return rows[0] || null;
}

oneRoutes.get('/capsules/:capsuleId', auth, h(async (req, res) => {
  const capsule = await capsuleAccess(req.params.capsuleId, req.user.id);
  if (!capsule) throw notFound('Cápsula não encontrada');
  const { rows: members } = await q(
    `SELECT u.id,u.handle,u.name,u.palette,u.avatar_url,cm.role,cm.joined_at
       FROM capsule_members cm JOIN users u ON u.id=cm.user_id
      WHERE cm.capsule_id=$1 ORDER BY cm.role='owner' DESC,cm.joined_at`,
    [capsule.id]
  );
  let items = [];
  if (!capsule.locked) {
    const result = await q(
      `SELECT i.id,i.author_id,i.body,i.media_url,
              (SELECT up.mime FROM uploads up WHERE up.url=i.media_url LIMIT 1) AS media_mime,
              i.created_at,u.handle,u.name,u.palette,u.avatar_url
         FROM capsule_items i JOIN users u ON u.id=i.author_id
        WHERE i.capsule_id=$1 ORDER BY i.created_at`,
      [capsule.id]
    );
    items = result.rows;
  }
  res.json({ ...capsule, members, items });
}));

oneRoutes.post('/capsules/:capsuleId/members', auth, h(async (req, res) => {
  const capsule = await capsuleAccess(req.params.capsuleId, req.user.id);
  if (!capsule) throw notFound('Cápsula não encontrada');
  if (capsule.role !== 'owner') throw forbidden('Só o criador pode adicionar pessoas');
  const userId = String(req.body?.userId || '');
  if (!validUuid(userId) || userId === req.user.id) throw bad('Pessoa inválida', 'bad_member');
  const { rows } = await q(
    `INSERT INTO capsule_members (capsule_id,user_id,role)
     SELECT $1,u.id,'member' FROM users u
      WHERE u.id=$2 AND u.suspended_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE
          (b.blocker_id=$3 AND b.blocked_id=u.id) OR (b.blocked_id=$3 AND b.blocker_id=u.id))
     ON CONFLICT (capsule_id,user_id) DO UPDATE SET role=capsule_members.role
     RETURNING user_id,role,joined_at`,
    [capsule.id, userId, req.user.id]
  );
  if (!rows[0]) throw notFound('Pessoa não encontrada');
  res.status(201).json(rows[0]);
}));

oneRoutes.post('/capsules/:capsuleId/items', auth, h(async (req, res) => {
  const capsule = await capsuleAccess(req.params.capsuleId, req.user.id);
  if (!capsule) throw notFound('Cápsula não encontrada');
  const body = cleanText(req.body?.body, 1200);
  const mediaUrl = String(req.body?.mediaUrl || '').trim() || null;
  if (!body && !mediaUrl) throw bad('Adiciona texto, fotografia ou vídeo', 'empty_item');

  const item = await tx(async (c) => {
    let claimed = null;
    if (mediaUrl) {
      claimed = await claimUpload(mediaUrl, req.user.id, 'capsule', (text, params) => c.query(text, params), { allowVideo: true });
      if (!claimed) throw bad('Media não verificado ou já utilizado', 'unconfirmed_upload');
    }
    const { rows } = await c.query(
      `INSERT INTO capsule_items (capsule_id,author_id,body,media_url)
       VALUES ($1,$2,$3,$4)
       RETURNING id,capsule_id,author_id,body,media_url,created_at`,
      [capsule.id, req.user.id, body, mediaUrl]
    );
    return { ...rows[0], media_mime: claimed?.mime || null };
  });
  res.status(201).json(item);
}));

oneRoutes.delete('/capsules/:capsuleId', auth, h(async (req, res) => {
  const capsule = await capsuleAccess(req.params.capsuleId, req.user.id);
  if (!capsule) throw notFound('Cápsula não encontrada');
  if (capsule.role !== 'owner') throw forbidden('Só o criador pode apagar a Cápsula');
  const { rows: media } = await q('SELECT media_url FROM capsule_items WHERE capsule_id=$1 AND media_url IS NOT NULL', [capsule.id]);
  await q('DELETE FROM capsules WHERE id=$1', [capsule.id]);
  for (const item of media) removeUploadIfUnreferenced(item.media_url).catch(() => {});
  res.json({ deleted: true });
}));

// ---- Juntos --------------------------------------------------------------
async function assertSourceVisible(userId, sourceType, sourceId) {
  if (sourceType === 'post') {
    const { rows } = await q(
      `SELECT p.id,p.body AS title FROM posts p JOIN users u ON u.id=p.author_id AND u.suspended_at IS NULL
        WHERE p.id::text=$2 AND p.hidden_at IS NULL AND COALESCE(p.kind,'post')='post'
          AND (p.author_id=$1 OR u.is_private=false OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=p.author_id))
          AND ${blockedWhere('$1', 'p.author_id')}`,
      [userId, sourceId]
    );
    return rows[0] || null;
  }
  if (sourceType === 'radar') {
    const { rows } = await q("SELECT id,title FROM radar_items WHERE id::text=$1 AND status='published' AND published_at<=now()", [sourceId]);
    return rows[0] || null;
  }
  const { rows } = await q(
    `SELECT ls.id,ls.title FROM live_streams ls
      WHERE ls.id::text=$2 AND (
        ls.creator_id=$1 OR (
          ${blockedWhere('$1', 'ls.creator_id')}
          AND (ls.privacy='public' OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=ls.creator_id))
        )
      )`,
    [userId, sourceId]
  );
  return rows[0] || null;
}

oneRoutes.get('/together', auth, h(async (req, res) => {
  await q('DELETE FROM together_sessions WHERE expires_at<=now()');
  const { rows } = await q(
    `SELECT s.id,s.host_id,s.source_type,s.source_id,s.title,s.state,s.created_at,s.updated_at,s.expires_at,
            (s.host_id=$1) AS mine,
            (SELECT count(*)::int FROM together_members m WHERE m.session_id=s.id) AS participants
       FROM together_sessions s
       JOIN together_members tm ON tm.session_id=s.id AND tm.user_id=$1
      WHERE s.expires_at>now() ORDER BY s.updated_at DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

oneRoutes.post('/together', auth, h(async (req, res) => {
  const sourceType = String(req.body?.sourceType || '').trim().toLowerCase();
  const sourceId = String(req.body?.sourceId || '').trim();
  if (!TOGETHER_TYPES.has(sourceType) || !sourceId) throw bad('Conteúdo inválido para Juntos', 'bad_source');
  const source = await assertSourceVisible(req.user.id, sourceType, sourceId);
  if (!source) throw notFound('Conteúdo não encontrado');
  const title = cleanText(req.body?.title || source.title || 'Juntos', 120);
  const session = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO together_sessions (host_id,source_type,source_id,title,state)
       VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *`,
      [req.user.id, sourceType, sourceId, title, JSON.stringify({ playing: false, positionMs: 0 })]
    );
    await c.query('INSERT INTO together_members (session_id,user_id) VALUES ($1,$2)', [rows[0].id, req.user.id]);
    return rows[0];
  });
  res.status(201).json(session);
}));

oneRoutes.post('/together/:sessionId/join', auth, h(async (req, res) => {
  if (!validUuid(req.params.sessionId)) throw notFound('Sessão não encontrada');
  const { rows } = await q('SELECT * FROM together_sessions WHERE id=$1 AND expires_at>now()', [req.params.sessionId]);
  if (!rows[0]) throw notFound('Sessão não encontrada');
  await q('INSERT INTO together_members (session_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [rows[0].id, req.user.id]);
  res.json(rows[0]);
}));

oneRoutes.get('/together/:sessionId', auth, h(async (req, res) => {
  if (!validUuid(req.params.sessionId)) throw notFound('Sessão não encontrada');
  const { rows } = await q(
    `SELECT s.*,(s.host_id=$2) AS mine
       FROM together_sessions s JOIN together_members m ON m.session_id=s.id
      WHERE s.id=$1 AND m.user_id=$2 AND s.expires_at>now()`,
    [req.params.sessionId, req.user.id]
  );
  if (!rows[0]) throw notFound('Sessão não encontrada');
  const members = await q(
    `SELECT u.id,u.handle,u.name,u.palette,u.avatar_url,m.joined_at
       FROM together_members m JOIN users u ON u.id=m.user_id
      WHERE m.session_id=$1 ORDER BY m.joined_at`,
    [rows[0].id]
  );
  res.json({ ...rows[0], members: members.rows });
}));

oneRoutes.patch('/together/:sessionId/state', auth, h(async (req, res) => {
  if (!validUuid(req.params.sessionId)) throw notFound('Sessão não encontrada');
  const { rows: own } = await q('SELECT id FROM together_sessions WHERE id=$1 AND host_id=$2 AND expires_at>now()', [req.params.sessionId, req.user.id]);
  if (!own[0]) throw forbidden('Só quem iniciou a sessão controla a reprodução');
  const playing = typeof req.body?.playing === 'boolean' ? req.body.playing : undefined;
  const positionMs = req.body?.positionMs === undefined ? undefined : Math.max(0, Math.min(86_400_000, Number(req.body.positionMs) || 0));
  const note = req.body?.note === undefined ? undefined : cleanText(req.body.note, 160);
  const patch = {};
  if (playing !== undefined) patch.playing = playing;
  if (positionMs !== undefined) patch.positionMs = positionMs;
  if (note !== undefined) patch.note = note;
  patch.changedAt = new Date().toISOString();
  const { rows } = await q(
    `UPDATE together_sessions SET state=state || $3::jsonb,updated_at=now()
      WHERE id=$1 AND host_id=$2 RETURNING *`,
    [req.params.sessionId, req.user.id, JSON.stringify(patch)]
  );
  res.json(rows[0]);
}));

// ---- Radar Local / Agora -------------------------------------------------
oneRoutes.get('/local', auth, h(async (req, res) => {
  const prefs = await getPreferences(req.user.id);
  const region = cleanText(req.query.region || prefs.local_region, 80);
  if (!region) return res.json({ region: null, items: [] });
  const needle = `%${region}%`;
  const { rows } = await q(
    `SELECT ri.id,ri.type,ri.title,ri.summary,ri.image_url,ri.external_url,
            ri.source_name,ri.sponsored,ri.sponsor_label,ri.tags,ri.region,
            ri.starts_at,ri.ends_at,ri.published_at,ri.priority
       FROM radar_items ri
      WHERE ri.status='published' AND ri.published_at<=now()
        AND (ri.ends_at IS NULL OR ri.ends_at>now())
        AND (
          COALESCE(ri.region,'') ILIKE $1 OR
          EXISTS (SELECT 1 FROM unnest(COALESCE(ri.tags,ARRAY[]::text[])) tag WHERE tag ILIKE $1) OR
          ri.title ILIKE $1 OR COALESCE(ri.summary,'') ILIKE $1
        )
      ORDER BY CASE WHEN COALESCE(ri.region,'') ILIKE $1 THEN 0 ELSE 1 END,
               ri.priority DESC,ri.published_at DESC
      LIMIT 30`,
    [needle]
  );
  res.json({ region, items: rows });
}));
