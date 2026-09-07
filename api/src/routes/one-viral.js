import { Router } from 'express';
import { q, tx } from '../db.js';
import { auth, h, bad, notFound, forbidden } from '../middleware/auth.js';
import { claimUpload } from '../lib/uploads.js';
import { publishRealtime } from '../realtime.js';

export const oneViralRoutes = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EFFECTS = new Set(['normal', 'mirror', 'mono', 'vivid']);
const PROVENANCE = new Set(['captured', 'edited_ai', 'generated_ai']);
const AGORA_TYPES = new Set(['coffee', 'sport', 'gaming', 'drinks', 'walk', 'cinema', 'food', 'music', 'study', 'custom']);
const RADAR_SIGNAL_TYPES = new Set(['save', 'share']);

const validUuid = value => UUID_RE.test(String(value || ''));
const clean = (value, max) => String(value || '').trim().slice(0, max);
const unique = values => [...new Set((values || []).map(String).filter(Boolean))];

const blockSql = (viewer, other) => `NOT EXISTS (
  SELECT 1 FROM blocks bl
   WHERE (bl.blocker_id=${viewer} AND bl.blocked_id=${other})
      OR (bl.blocked_id=${viewer} AND bl.blocker_id=${other})
)`;

const mutualSql = (viewer, other) => `EXISTS (
  SELECT 1 FROM follows f1 WHERE f1.follower_id=${viewer} AND f1.following_id=${other}
) AND EXISTS (
  SELECT 1 FROM follows f2 WHERE f2.follower_id=${other} AND f2.following_id=${viewer}
)`;

async function mutualFriends(userId, ids = null, query = q) {
  const wanted = ids ? unique(ids).filter(validUuid) : null;
  if (ids && wanted.length !== unique(ids).length) throw bad('Amigo inválido', 'bad_friend');
  const { rows } = await query(
    `SELECT u.id,u.handle,u.name,u.palette,u.avatar_url
       FROM users u
      WHERE u.id<>$1 AND u.suspended_at IS NULL
        AND ${mutualSql('$1', 'u.id')}
        AND ${blockSql('$1', 'u.id')}
        AND ($2::uuid[] IS NULL OR u.id=ANY($2::uuid[]))
      ORDER BY u.name,u.handle
      LIMIT 100`,
    [userId, wanted]
  );
  return rows;
}

async function chainAccess(chainId, userId, { activeOnly = false } = {}) {
  if (!validUuid(chainId)) return null;
  const { rows } = await q(
    `SELECT c.*,m.role,
            (c.active_until>now()) AS active,
            (c.mode='collective' AND c.active_until<=now() AND c.recap_until>now()) AS recap_ready
       FROM viral_lume_chains c
       JOIN viral_lume_members m ON m.chain_id=c.id AND m.user_id=$2
      WHERE c.id=$1
        AND c.recap_until>now()
        AND ($3::boolean=false OR c.active_until>now())`,
    [chainId, userId, activeOnly]
  );
  return rows[0] || null;
}

async function chainRecipientIds(chainId) {
  const { rows } = await q('SELECT user_id FROM viral_lume_members WHERE chain_id=$1', [chainId]);
  return rows.map(row => row.user_id);
}

async function agoraAccess(intentId, userId, { memberOnly = false } = {}) {
  if (!validUuid(intentId)) return null;
  const { rows } = await q(
    `SELECT a.*,
            m.role,
            (m.user_id IS NOT NULL) AS joined,
            (a.author_id=$2) AS mine,
            (SELECT count(*)::int FROM agora_members am WHERE am.intent_id=a.id) AS member_count
       FROM agora_intents a
       LEFT JOIN agora_members m ON m.intent_id=a.id AND m.user_id=$2
      WHERE a.id=$1
        AND ($3::boolean=false OR m.user_id IS NOT NULL)`,
    [intentId, userId, memberOnly]
  );
  return rows[0] || null;
}

// -------------------------------------------------------------------------
// LUME 2.0 — privado, dirigido e coletivo.
// -------------------------------------------------------------------------
oneViralRoutes.get('/viral/lume-friends', auth, h(async (req, res) => {
  res.json(await mutualFriends(req.user.id));
}));

oneViralRoutes.get('/viral/lume-chains', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT c.id,c.owner_id,c.mode,c.title,c.active_until,c.recap_until,c.created_at,
            (c.owner_id=$1) AS mine,
            (c.active_until>now()) AS active,
            (c.mode='collective' AND c.active_until<=now() AND c.recap_until>now()) AS recap_ready,
            ou.handle AS owner_handle,ou.name AS owner_name,ou.palette AS owner_palette,ou.avatar_url AS owner_avatar_url,
            (SELECT count(*)::int FROM viral_lume_members m2 WHERE m2.chain_id=c.id) AS member_count,
            (SELECT count(*)::int FROM viral_lume_entries e WHERE e.chain_id=c.id) AS entry_count,
            (SELECT count(*)::int
               FROM viral_lume_entries e
              WHERE e.chain_id=c.id AND e.author_id<>$1
                AND NOT EXISTS (SELECT 1 FROM viral_lume_views v WHERE v.entry_id=e.id AND v.user_id=$1)) AS unseen_count,
            (SELECT max(e.created_at) FROM viral_lume_entries e WHERE e.chain_id=c.id) AS last_entry_at
       FROM viral_lume_chains c
       JOIN viral_lume_members m ON m.chain_id=c.id AND m.user_id=$1
       JOIN users ou ON ou.id=c.owner_id
      WHERE c.recap_until>now()
      ORDER BY (c.active_until>now()) DESC,COALESCE((SELECT max(e.created_at) FROM viral_lume_entries e WHERE e.chain_id=c.id),c.created_at) DESC
      LIMIT 80`,
    [req.user.id]
  );
  res.json(rows);
}));

oneViralRoutes.get('/viral/lume-recaps', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT c.id,c.title,c.active_until,c.recap_until,c.created_at,
            u.name AS owner_name,u.handle AS owner_handle,u.palette AS owner_palette,u.avatar_url AS owner_avatar_url,
            (SELECT count(*)::int FROM viral_lume_members x WHERE x.chain_id=c.id) AS member_count,
            (SELECT count(*)::int FROM viral_lume_entries e WHERE e.chain_id=c.id) AS entry_count
       FROM viral_lume_chains c
       JOIN viral_lume_members m ON m.chain_id=c.id AND m.user_id=$1
       JOIN users u ON u.id=c.owner_id
      WHERE c.mode='collective' AND c.active_until<=now() AND c.recap_until>now()
      ORDER BY c.active_until DESC LIMIT 30`,
    [req.user.id]
  );
  res.json(rows);
}));

oneViralRoutes.post('/viral/lume-chains', auth, h(async (req, res) => {
  const mode = req.body?.mode === 'collective' ? 'collective' : 'direct';
  const title = clean(req.body?.title, 80);
  const mediaUrl = String(req.body?.mediaUrl || '').trim();
  const effect = String(req.body?.effect || 'normal').toLowerCase();
  const caption = clean(req.body?.caption, 180);
  const provenance = String(req.body?.provenance || 'captured').toLowerCase();
  const recipientIds = unique(req.body?.recipientIds).filter(id => id !== req.user.id).slice(0, mode === 'collective' ? 20 : 12);
  if (!recipientIds.length) throw bad('Escolhe pelo menos um amigo', 'missing_recipients');
  if (!mediaUrl) throw bad('Tira uma fotografia para acender o Lume', 'missing_media');
  if (!EFFECTS.has(effect)) throw bad('Efeito inválido', 'bad_effect');
  if (!PROVENANCE.has(provenance)) throw bad('Origem do conteúdo inválida', 'bad_provenance');

  const created = await tx(async c => {
    const friends = await mutualFriends(req.user.id, recipientIds, (text, params) => c.query(text, params));
    if (friends.length !== recipientIds.length) throw forbidden('Só podes enviar este Lume a amigos mútuos');
    const claimed = await claimUpload(mediaUrl, req.user.id, 'lume', (text, params) => c.query(text, params), { allowVideo:false });
    if (!claimed) throw bad('Fotografia não verificada ou já utilizada', 'unconfirmed_upload');

    const activeHours = mode === 'collective' ? 12 : 24;
    const recapDays = mode === 'collective' ? 7 : 0;
    const { rows } = await c.query(
      `INSERT INTO viral_lume_chains (owner_id,mode,title,active_until,recap_until)
       VALUES ($1,$2,$3,now()+($4||' hours')::interval,
              now()+($4||' hours')::interval+($5||' days')::interval)
       RETURNING *`,
      [req.user.id, mode, title, activeHours, recapDays]
    );
    const chain = rows[0];
    await c.query("INSERT INTO viral_lume_members (chain_id,user_id,role) VALUES ($1,$2,'owner')", [chain.id, req.user.id]);
    for (const userId of recipientIds) {
      await c.query("INSERT INTO viral_lume_members (chain_id,user_id,role) VALUES ($1,$2,'member')", [chain.id, userId]);
    }
    const entry = await c.query(
      `INSERT INTO viral_lume_entries (chain_id,author_id,media_url,effect,caption,provenance)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [chain.id, req.user.id, mediaUrl, effect, caption, provenance]
    );
    return { chain, entry:entry.rows[0], recipients:recipientIds };
  });

  await publishRealtime([req.user.id, ...created.recipients], 'viral_lume_changed', { chainId:created.chain.id });
  res.status(201).json({ ...created.chain, entry:created.entry });
}));

oneViralRoutes.get('/viral/lume-chains/:chainId', auth, h(async (req, res) => {
  const chain = await chainAccess(req.params.chainId, req.user.id);
  if (!chain) throw notFound('Lume não encontrado');
  const members = await q(
    `SELECT u.id,u.handle,u.name,u.palette,u.avatar_url,m.role,m.joined_at
       FROM viral_lume_members m JOIN users u ON u.id=m.user_id
      WHERE m.chain_id=$1 ORDER BY m.role='owner' DESC,m.joined_at`,
    [chain.id]
  );
  const entries = await q(
    `SELECT e.id,e.chain_id,e.author_id,e.effect,e.caption,e.provenance,e.reply_to_id,e.created_at,
            u.handle,u.name,u.palette,u.avatar_url,
            (e.author_id=$2) AS mine,
            EXISTS (SELECT 1 FROM viral_lume_views v WHERE v.entry_id=e.id AND v.user_id=$2) AS viewed,
            CASE
              WHEN e.author_id=$2 THEN e.media_url
              WHEN $3::boolean THEN e.media_url
              ELSE NULL
            END AS media_url,
            (SELECT up.mime FROM uploads up WHERE up.url=e.media_url LIMIT 1) AS media_mime
       FROM viral_lume_entries e JOIN users u ON u.id=e.author_id
      WHERE e.chain_id=$1 ORDER BY e.created_at`,
    [chain.id, req.user.id, !!chain.recap_ready]
  );
  res.json({ ...chain, members:members.rows, entries:entries.rows });
}));

oneViralRoutes.post('/viral/lume-chains/:chainId/entries', auth, h(async (req, res) => {
  const chain = await chainAccess(req.params.chainId, req.user.id, { activeOnly:true });
  if (!chain) throw notFound('Este Lume já terminou');
  const mediaUrl = String(req.body?.mediaUrl || '').trim();
  const effect = String(req.body?.effect || 'normal').toLowerCase();
  const caption = clean(req.body?.caption, 180);
  const provenance = String(req.body?.provenance || 'captured').toLowerCase();
  const replyToId = req.body?.replyToId ? String(req.body.replyToId) : null;
  if (!mediaUrl) throw bad('Tira uma fotografia para responder', 'missing_media');
  if (!EFFECTS.has(effect) || !PROVENANCE.has(provenance)) throw bad('Dados do Lume inválidos', 'bad_lume');
  if (replyToId && !validUuid(replyToId)) throw bad('Resposta inválida', 'bad_reply');

  const entry = await tx(async c => {
    if (replyToId) {
      const parent = await c.query('SELECT id FROM viral_lume_entries WHERE id=$1 AND chain_id=$2', [replyToId, chain.id]);
      if (!parent.rows[0]) throw bad('A mensagem original não pertence a este Lume', 'bad_reply');
    }
    const claimed = await claimUpload(mediaUrl, req.user.id, 'lume', (text, params) => c.query(text, params), { allowVideo:false });
    if (!claimed) throw bad('Fotografia não verificada ou já utilizada', 'unconfirmed_upload');
    const { rows } = await c.query(
      `INSERT INTO viral_lume_entries (chain_id,author_id,media_url,effect,caption,provenance,reply_to_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [chain.id, req.user.id, mediaUrl, effect, caption, provenance, replyToId]
    );
    return rows[0];
  });
  const recipients = await chainRecipientIds(chain.id);
  await publishRealtime(recipients, 'viral_lume_changed', { chainId:chain.id, entryId:entry.id });
  res.status(201).json(entry);
}));

oneViralRoutes.post('/viral/lume-entries/:entryId/open', auth, h(async (req, res) => {
  if (!validUuid(req.params.entryId)) throw notFound('Lume não encontrado');
  const result = await tx(async c => {
    const { rows } = await c.query(
      `SELECT e.*,lc.active_until,lc.recap_until
         FROM viral_lume_entries e
         JOIN viral_lume_chains lc ON lc.id=e.chain_id
         JOIN viral_lume_members lm ON lm.chain_id=lc.id AND lm.user_id=$2
        WHERE e.id=$1 AND lc.active_until>now()
        FOR UPDATE OF e`,
      [req.params.entryId, req.user.id]
    );
    const entry = rows[0];
    if (!entry) throw notFound('Este Lume já não está disponível');
    if (entry.author_id === req.user.id) return { ...entry, mine:true };
    const opened = await c.query(
      `INSERT INTO viral_lume_views (entry_id,user_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING RETURNING viewed_at`,
      [entry.id, req.user.id]
    );
    if (!opened.rowCount) {
      const error = bad('Este Lume já foi visto', 'lume_already_viewed');
      error.status = 410;
      throw error;
    }
    return { ...entry, viewed_at:opened.rows[0].viewed_at, mine:false };
  });
  res.json(result);
}));

oneViralRoutes.get('/viral/lume-chains/:chainId/recap', auth, h(async (req, res) => {
  const chain = await chainAccess(req.params.chainId, req.user.id);
  if (!chain || !chain.recap_ready) throw notFound('Recap ainda não disponível');
  const members = await q(
    `SELECT u.id,u.handle,u.name,u.palette,u.avatar_url
       FROM viral_lume_members m JOIN users u ON u.id=m.user_id
      WHERE m.chain_id=$1 ORDER BY m.joined_at`, [chain.id]
  );
  const entries = await q(
    `SELECT e.id,e.author_id,e.media_url,e.effect,e.caption,e.provenance,e.created_at,
            u.name,u.handle,u.palette,u.avatar_url,
            (SELECT up.mime FROM uploads up WHERE up.url=e.media_url LIMIT 1) AS media_mime
       FROM viral_lume_entries e JOIN users u ON u.id=e.author_id
      WHERE e.chain_id=$1 ORDER BY e.created_at`, [chain.id]
  );
  res.json({ ...chain, members:members.rows, entries:entries.rows });
}));

oneViralRoutes.delete('/viral/lume-chains/:chainId', auth, h(async (req, res) => {
  if (!validUuid(req.params.chainId)) throw notFound('Lume não encontrado');
  const { rows } = await q(
    'DELETE FROM viral_lume_chains WHERE id=$1 AND owner_id=$2 RETURNING id',
    [req.params.chainId, req.user.id]
  );
  if (!rows[0]) throw forbidden('Só quem criou pode terminar este Lume');
  res.json({ deleted:true });
}));

// -------------------------------------------------------------------------
// AGORA — intenções sociais temporárias. Local exato só para participantes.
// -------------------------------------------------------------------------
oneViralRoutes.get('/viral/agora', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT a.id,a.author_id,a.kind,a.title,a.note,a.coarse_location,a.starts_at,a.expires_at,a.capacity,a.status,a.created_at,
            u.handle,u.name,u.palette,u.avatar_url,
            (a.author_id=$1) AS mine,
            EXISTS (SELECT 1 FROM agora_members am WHERE am.intent_id=a.id AND am.user_id=$1) AS joined,
            (SELECT count(*)::int FROM agora_members am WHERE am.intent_id=a.id) AS member_count
       FROM agora_intents a JOIN users u ON u.id=a.author_id AND u.suspended_at IS NULL
      WHERE a.status='open' AND a.expires_at>now()
        AND (a.author_id=$1 OR (${mutualSql('$1', 'a.author_id')} AND ${blockSql('$1', 'a.author_id')}))
      ORDER BY a.starts_at NULLS FIRST,a.created_at DESC
      LIMIT 80`,
    [req.user.id]
  );
  res.json(rows);
}));

oneViralRoutes.post('/viral/agora', auth, h(async (req, res) => {
  const kind = String(req.body?.kind || 'custom').toLowerCase();
  const title = clean(req.body?.title, 100);
  const note = clean(req.body?.note, 300);
  const coarseLocation = clean(req.body?.coarseLocation, 100);
  const meetingPoint = clean(req.body?.meetingPoint, 180);
  const capacity = Math.max(2, Math.min(30, Number(req.body?.capacity) || 8));
  if (!AGORA_TYPES.has(kind)) throw bad('Tipo de plano inválido', 'bad_agora_kind');
  if (!title) throw bad('Diz o que te apetece fazer', 'missing_title');
  let startsAt = null;
  if (req.body?.startsAt) {
    const parsed = new Date(req.body.startsAt);
    if (Number.isNaN(parsed.getTime())) throw bad('Hora inválida', 'bad_start');
    startsAt = parsed.toISOString();
  }
  const requestedHours = Math.max(1, Math.min(24, Number(req.body?.hours) || 4));

  const intent = await tx(async c => {
    const { rows } = await c.query(
      `INSERT INTO agora_intents (author_id,kind,title,note,coarse_location,meeting_point,starts_at,expires_at,capacity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now()+($8||' hours')::interval,$9)
       RETURNING *`,
      [req.user.id, kind, title, note, coarseLocation, meetingPoint, startsAt, requestedHours, capacity]
    );
    await c.query("INSERT INTO agora_members (intent_id,user_id,role) VALUES ($1,$2,'owner')", [rows[0].id, req.user.id]);
    return rows[0];
  });
  const friends = await mutualFriends(req.user.id);
  publishRealtime(friends.map(f => f.id), 'agora_changed', { intentId:intent.id }).catch(() => {});
  res.status(201).json({ ...intent, mine:true, joined:true, member_count:1 });
}));

oneViralRoutes.get('/viral/agora/:intentId', auth, h(async (req, res) => {
  const intent = await agoraAccess(req.params.intentId, req.user.id);
  if (!intent) throw notFound('Plano não encontrado');
  if (!intent.mine) {
    const friends = await mutualFriends(req.user.id, [intent.author_id]);
    if (!friends.length) throw forbidden('Este plano é apenas para amigos');
  }
  const members = await q(
    `SELECT u.id,u.handle,u.name,u.palette,u.avatar_url,m.role,m.joined_at
       FROM agora_members m JOIN users u ON u.id=m.user_id
      WHERE m.intent_id=$1 ORDER BY m.role='owner' DESC,m.joined_at`,
    [intent.id]
  );
  res.json({ ...intent, meeting_point:intent.joined ? intent.meeting_point : '', members:members.rows });
}));

oneViralRoutes.post('/viral/agora/:intentId/join', auth, h(async (req, res) => {
  if (!validUuid(req.params.intentId)) throw notFound('Plano não encontrado');
  const joined = await tx(async c => {
    const { rows } = await c.query('SELECT * FROM agora_intents WHERE id=$1 FOR UPDATE', [req.params.intentId]);
    const intent = rows[0];
    if (!intent || intent.status!=='open' || new Date(intent.expires_at) <= new Date()) throw notFound('Este plano já terminou');
    if (intent.author_id !== req.user.id) {
      const friends = await mutualFriends(req.user.id, [intent.author_id], (text, params) => c.query(text, params));
      if (!friends.length) throw forbidden('Só amigos podem entrar neste plano');
    }
    const count = await c.query('SELECT count(*)::int AS n FROM agora_members WHERE intent_id=$1', [intent.id]);
    if (count.rows[0].n >= intent.capacity) throw bad('Este plano já está cheio', 'agora_full');
    await c.query("INSERT INTO agora_members (intent_id,user_id,role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING", [intent.id, req.user.id]);
    return intent;
  });
  const recipients = (await q('SELECT user_id FROM agora_members WHERE intent_id=$1', [joined.id])).rows.map(r => r.user_id);
  await publishRealtime(recipients, 'agora_changed', { intentId:joined.id });
  res.json({ joined:true, meeting_point:joined.meeting_point });
}));

oneViralRoutes.post('/viral/agora/:intentId/leave', auth, h(async (req, res) => {
  const intent = await agoraAccess(req.params.intentId, req.user.id, { memberOnly:true });
  if (!intent) throw notFound('Plano não encontrado');
  if (intent.role === 'owner') throw bad('Quem criou o plano pode terminá-lo, não abandoná-lo', 'owner_cannot_leave');
  await q('DELETE FROM agora_members WHERE intent_id=$1 AND user_id=$2', [intent.id, req.user.id]);
  res.json({ left:true });
}));

oneViralRoutes.delete('/viral/agora/:intentId', auth, h(async (req, res) => {
  if (!validUuid(req.params.intentId)) throw notFound('Plano não encontrado');
  const { rows } = await q(
    `UPDATE agora_intents SET status='cancelled'
      WHERE id=$1 AND author_id=$2 RETURNING id`,
    [req.params.intentId, req.user.id]
  );
  if (!rows[0]) throw forbidden('Só quem criou pode terminar o plano');
  res.json({ cancelled:true });
}));

oneViralRoutes.get('/viral/agora/:intentId/messages', auth, h(async (req, res) => {
  const intent = await agoraAccess(req.params.intentId, req.user.id, { memberOnly:true });
  if (!intent) throw forbidden('Entra no plano para veres a conversa');
  const { rows } = await q(
    `SELECT m.id,m.author_id,m.body,m.created_at,u.name,u.handle,u.palette,u.avatar_url
       FROM agora_messages m JOIN users u ON u.id=m.author_id
      WHERE m.intent_id=$1 ORDER BY m.created_at DESC LIMIT 80`,
    [intent.id]
  );
  res.json(rows.reverse());
}));

oneViralRoutes.post('/viral/agora/:intentId/messages', auth, h(async (req, res) => {
  const intent = await agoraAccess(req.params.intentId, req.user.id, { memberOnly:true });
  if (!intent || intent.status!=='open' || new Date(intent.expires_at) <= new Date()) throw forbidden('Esta conversa já terminou');
  const body = clean(req.body?.body, 500);
  if (!body) throw bad('Escreve uma mensagem', 'empty_message');
  const { rows } = await q(
    `INSERT INTO agora_messages (intent_id,author_id,body) VALUES ($1,$2,$3) RETURNING *`,
    [intent.id, req.user.id, body]
  );
  const recipients = (await q('SELECT user_id FROM agora_members WHERE intent_id=$1', [intent.id])).rows.map(r => r.user_id);
  await publishRealtime(recipients, 'agora_message', { intentId:intent.id, messageId:rows[0].id });
  res.status(201).json(rows[0]);
}));

oneViralRoutes.post('/viral/agora/:intentId/lume', auth, h(async (req, res) => {
  const intent = await agoraAccess(req.params.intentId, req.user.id, { memberOnly:true });
  if (!intent) throw forbidden('Só participantes podem acender o Lume coletivo');
  const members = await q('SELECT user_id FROM agora_members WHERE intent_id=$1 ORDER BY joined_at', [intent.id]);
  if (members.rows.length < 2) throw bad('É preciso pelo menos mais uma pessoa', 'not_enough_people');
  const existing = await q(
    `SELECT c.id FROM viral_lume_chains c
      WHERE c.owner_id=$1 AND c.mode='collective' AND c.title=$2 AND c.active_until>now()
      ORDER BY c.created_at DESC LIMIT 1`,
    [req.user.id, `Agora · ${intent.title}`.slice(0,80)]
  );
  if (existing.rows[0]) return res.json({ chainId:existing.rows[0].id, reused:true });
  const chain = await tx(async c => {
    const { rows } = await c.query(
      `INSERT INTO viral_lume_chains (owner_id,mode,title,active_until,recap_until)
       VALUES ($1,'collective',$2,now()+interval '12 hours',now()+interval '7 days 12 hours') RETURNING *`,
      [req.user.id, `Agora · ${intent.title}`.slice(0,80)]
    );
    for (const row of members.rows) {
      await c.query(
        `INSERT INTO viral_lume_members (chain_id,user_id,role) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING`,
        [rows[0].id, row.user_id, row.user_id === req.user.id ? 'owner' : 'member']
      );
    }
    return rows[0];
  });
  await publishRealtime(members.rows.map(r=>r.user_id), 'viral_lume_changed', { chainId:chain.id, fromAgora:intent.id });
  res.status(201).json({ chainId:chain.id, reused:false });
}));

// -------------------------------------------------------------------------
// RADAR DOS MEUS — sinais agregados da rede; nunca devolve identidades.
// -------------------------------------------------------------------------
async function resolveRadarItem({ itemId, externalUrl, title }) {
  if (validUuid(itemId)) {
    const { rows } = await q("SELECT id FROM radar_items WHERE id=$1 AND status='published' AND published_at<=now()", [itemId]);
    return rows[0] || null;
  }
  const url = clean(externalUrl, 1000);
  const cleanTitle = clean(title, 180);
  if (url) {
    const { rows } = await q(
      "SELECT id FROM radar_items WHERE status='published' AND published_at<=now() AND external_url=$1 ORDER BY published_at DESC LIMIT 1",
      [url]
    );
    if (rows[0]) return rows[0];
  }
  if (cleanTitle) {
    const { rows } = await q(
      "SELECT id FROM radar_items WHERE status='published' AND published_at<=now() AND lower(title)=lower($1) ORDER BY published_at DESC LIMIT 1",
      [cleanTitle]
    );
    return rows[0] || null;
  }
  return null;
}

oneViralRoutes.post('/viral/radar/signal', auth, h(async (req, res) => {
  const kind = String(req.body?.kind || '').toLowerCase();
  if (!RADAR_SIGNAL_TYPES.has(kind)) throw bad('Ação Radar inválida', 'bad_radar_signal');
  const item = await resolveRadarItem(req.body || {});
  if (!item) throw notFound('Conteúdo Radar não encontrado');
  await q(
    `INSERT INTO radar_network_signals (user_id,radar_item_id,kind)
     VALUES ($1,$2,$3)
     ON CONFLICT (user_id,radar_item_id,kind) DO UPDATE SET created_at=now()`,
    [req.user.id, item.id, kind]
  );
  res.json({ saved:true, itemId:item.id, kind });
}));

oneViralRoutes.delete('/viral/radar/:itemId/signal/:kind', auth, h(async (req, res) => {
  const kind = String(req.params.kind || '').toLowerCase();
  if (!validUuid(req.params.itemId) || !RADAR_SIGNAL_TYPES.has(kind)) throw bad('Ação Radar inválida', 'bad_radar_signal');
  await q('DELETE FROM radar_network_signals WHERE user_id=$1 AND radar_item_id=$2 AND kind=$3', [req.user.id, req.params.itemId, kind]);
  res.json({ removed:true });
}));

oneViralRoutes.get('/viral/radar/friends', auth, h(async (req, res) => {
  const { rows } = await q(
    `WITH network AS (
       SELECT f.following_id AS friend_id
         FROM follows f
        WHERE f.follower_id=$1
          AND EXISTS (SELECT 1 FROM follows back WHERE back.follower_id=f.following_id AND back.following_id=$1)
          AND ${blockSql('$1', 'f.following_id')}
     )
     SELECT ri.id,ri.type,ri.title,ri.summary,ri.body,ri.image_url,ri.external_url,
            ri.source_name,ri.sponsored,ri.sponsor_label,ri.tags,ri.region,
            ri.starts_at,ri.ends_at,ri.published_at,ri.priority,
            count(DISTINCT s.user_id)::int AS network_count,
            count(*)::int AS signal_count,
            bool_or(s.kind='save') AS has_saves,
            bool_or(s.kind='share') AS has_shares,
            max(s.created_at) AS network_last_at
       FROM radar_network_signals s
       JOIN network n ON n.friend_id=s.user_id
       JOIN radar_items ri ON ri.id=s.radar_item_id
      WHERE ri.status='published' AND ri.published_at<=now()
        AND (ri.ends_at IS NULL OR ri.ends_at>now())
        AND s.created_at>now()-interval '30 days'
      GROUP BY ri.id
      ORDER BY count(DISTINCT s.user_id) DESC,count(*) DESC,max(s.created_at) DESC,ri.published_at DESC
      LIMIT 50`,
    [req.user.id]
  );
  res.json({ items:rows });
}));
