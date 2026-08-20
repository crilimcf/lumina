import { Router } from 'express';
import { q, tx } from '../db.js';
import { auth, h, bad, forbidden, notFound } from '../middleware/auth.js';
import { sendPushToUser } from '../lib/webpush.js';

export const groupCallRoutes = Router();
const GROUP_PREFIX = 'g:';
const GROUP_THREAD_PREFIX = 'group:';
const ROOM_PREFIX = 'room:'; // compatibilidade com grupos antigos baseados em Salas
const MAX_GROUP_PARTICIPANTS = 6;
const MAX_OTHER_PEOPLE = MAX_GROUP_PARTICIPANTS - 1;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const groupIdOf = value => String(value || '').startsWith(GROUP_PREFIX)
  ? String(value).slice(GROUP_PREFIX.length)
  : null;
const groupThreadIdOf = value => String(value || '').startsWith(GROUP_THREAD_PREFIX)
  ? String(value).slice(GROUP_THREAD_PREFIX.length)
  : null;
const roomIdOf = value => String(value || '').startsWith(ROOM_PREFIX)
  ? String(value).slice(ROOM_PREFIX.length)
  : null;

async function groupCall(callId, userId, query = q) {
  const id = groupIdOf(callId);
  if (!id) return null;
  const { rows } = await query(
    `SELECT gc.*,
            COALESCE(gg.name,r.name) AS group_name,
            COALESCE(gg.image_url,r.image_url) AS group_image,
            gp.status AS participant_status,
            gp.joined_at AS self_joined_at
       FROM group_call_sessions gc
       LEFT JOIN group_call_groups gg ON gg.id=gc.group_id
       LEFT JOIN rooms r ON r.id=gc.room_id
       JOIN group_call_participants gp ON gp.call_id=gc.id AND gp.user_id=$2
      WHERE gc.id=$1`,
    [id, userId]
  );
  if (!rows[0]) throw notFound('Chamada de grupo não encontrada');
  return rows[0];
}

async function participantsFor(callId, query = q) {
  const { rows } = await query(
    `SELECT gp.user_id AS id,gp.status,gp.seen_at,gp.joined_at,gp.left_at,
            u.name,u.handle,u.palette,u.avatar_url
       FROM group_call_participants gp
       JOIN users u ON u.id=gp.user_id AND u.suspended_at IS NULL
      WHERE gp.call_id=$1
      ORDER BY gp.joined_at NULLS LAST,gp.invited_at ASC`,
    [callId]
  );
  return rows;
}

async function publicGroupCall(call, userId, query = q) {
  const participants = await participantsFor(call.id, query);
  return {
    id:`${GROUP_PREFIX}${call.id}`,
    group:true,
    group_id:call.group_id || null,
    room_id:call.room_id || null,
    initiator_id:call.initiator_id,
    mode:'video',
    status:call.status,
    created_at:call.created_at,
    answered_at:call.started_at,
    ended_at:call.ended_at,
    self_id:userId,
    self_joined_at:call.self_joined_at || participants.find(p => p.id === userId)?.joined_at || null,
    name:call.group_name,
    group_name:call.group_name,
    avatar_url:call.group_image || null,
    palette:participants.find(p => p.id === call.initiator_id)?.palette ?? 0,
    participants,
  };
}

async function persistentGroup(groupId, userId, query = q) {
  const { rows } = await query(
    `SELECT g.id,g.creator_id,g.name,g.image_url,g.created_at,g.updated_at,
            self.role AS self_role,
            (SELECT count(*)::int
               FROM group_call_group_members gm
               JOIN users member ON member.id=gm.user_id AND member.suspended_at IS NULL
              WHERE gm.group_id=g.id) AS member_count
       FROM group_call_groups g
       JOIN group_call_group_members self ON self.group_id=g.id AND self.user_id=$2
      WHERE g.id=$1`,
    [groupId, userId]
  );
  return rows[0] || null;
}

async function eligibleGroup(groupId, userId) {
  const group = await persistentGroup(groupId, userId);
  if (!group) throw forbidden('Este grupo não está disponível');
  return group;
}

async function persistentGroupMembers(groupId, initiatorId) {
  const { rows } = await q(
    `SELECT u.id,u.name,u.handle,u.palette,u.avatar_url
       FROM group_call_group_members gm
       JOIN users u ON u.id=gm.user_id AND u.suspended_at IS NULL
      WHERE gm.group_id=$1
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
           WHERE (b.blocker_id=$2 AND b.blocked_id=u.id)
              OR (b.blocked_id=$2 AND b.blocker_id=u.id)
        )
      ORDER BY (u.id=$2) DESC,(gm.role='owner') DESC,gm.added_at,u.name
      LIMIT $3`,
    [groupId, initiatorId, MAX_GROUP_PARTICIPANTS]
  );
  return rows;
}

async function eligibleRoom(roomId, userId) {
  const { rows } = await q(
    `SELECT r.id,r.name,r.image_url,r.creator_id,r.visibility,
            EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id=r.id AND rm.user_id=$2) AS joined,
            EXISTS(SELECT 1 FROM room_invites ri WHERE ri.room_id=r.id AND ri.user_id=$2) AS invited
       FROM rooms r
      WHERE r.id=$1 AND r.billing_state='active'`,
    [roomId, userId]
  );
  const room = rows[0];
  if (!room || room.visibility !== 'private' || (!room.joined && room.creator_id !== userId)) {
    throw forbidden('Este grupo não está disponível');
  }
  return room;
}

async function legacyRoomMembers(roomId, initiatorId) {
  const { rows } = await q(
    `WITH candidates AS (
       SELECT user_id,0 AS priority FROM room_members WHERE room_id=$1
       UNION
       SELECT user_id,1 AS priority FROM room_invites WHERE room_id=$1
     ), ranked AS (
       SELECT user_id,min(priority) AS priority FROM candidates GROUP BY user_id
     )
     SELECT u.id,u.name,u.handle,u.palette,u.avatar_url
       FROM ranked x
       JOIN users u ON u.id=x.user_id AND u.suspended_at IS NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM blocks b
         WHERE (b.blocker_id=$2 AND b.blocked_id=u.id)
            OR (b.blocked_id=$2 AND b.blocker_id=u.id)
      )
      ORDER BY (u.id=$2) DESC,x.priority,u.name
      LIMIT $3`,
    [roomId, initiatorId, MAX_GROUP_PARTICIPANTS]
  );
  return rows;
}

async function pushReadyFor(userId) {
  const { rows } = await q(
    `SELECT EXISTS(
       SELECT 1 FROM web_push_subscriptions WHERE user_id=$1
       UNION ALL
       SELECT 1 FROM push_tokens WHERE user_id=$1 AND platform IN ('ios','android')
     ) AS ready`,
    [userId]
  );
  return !!rows[0]?.ready;
}

// Grupos persistentes de videochamada vivem no Direct e nunca criam uma Sala.
groupCallRoutes.get('/groups', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT g.id,g.creator_id,g.name,g.image_url,g.created_at,g.updated_at,
            self.role AS self_role,
            (SELECT count(*)::int
               FROM group_call_group_members gm2
               JOIN users member ON member.id=gm2.user_id AND member.suspended_at IS NULL
              WHERE gm2.group_id=g.id) AS member_count
       FROM group_call_groups g
       JOIN group_call_group_members self ON self.group_id=g.id AND self.user_id=$1
      ORDER BY (g.creator_id=$1) DESC,g.updated_at DESC,g.created_at DESC
      LIMIT 100`,
    [req.user.id]
  );
  res.json(rows);
}));

groupCallRoutes.post('/groups', auth, h(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const rawIds = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];
  const memberIds = [...new Set(rawIds.map(value => String(value || '').trim()).filter(Boolean))]
    .filter(value => value !== req.user.id);

  if (name.length < 3 || name.length > 60) throw bad('O nome do grupo tem entre 3 e 60 caracteres');
  if (memberIds.length < 1) throw bad('Escolhe pelo menos uma pessoa');
  if (memberIds.length > MAX_OTHER_PEOPLE) throw bad('Podes escolher no máximo 5 pessoas');
  if (memberIds.some(id => !UUID_RE.test(id))) throw bad('Pessoa inválida');

  const { rows:people } = await q(
    `SELECT u.id
       FROM users u
      WHERE u.id=ANY($1::uuid[])
        AND u.suspended_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
           WHERE (b.blocker_id=$2 AND b.blocked_id=u.id)
              OR (b.blocked_id=$2 AND b.blocker_id=u.id)
        )`,
    [memberIds, req.user.id]
  );
  if (people.length !== memberIds.length) throw forbidden('Uma das pessoas já não pode ser adicionada a este grupo');

  const created = await tx(async c => {
    const { rows } = await c.query(
      `INSERT INTO group_call_groups (creator_id,name)
       VALUES ($1,$2) RETURNING id`,
      [req.user.id, name]
    );
    const groupId = rows[0].id;
    await c.query(
      `INSERT INTO group_call_group_members (group_id,user_id,role)
       VALUES ($1,$2,'owner')`,
      [groupId, req.user.id]
    );
    for (const userId of memberIds) {
      await c.query(
        `INSERT INTO group_call_group_members (group_id,user_id,role)
         VALUES ($1,$2,'member')`,
        [groupId, userId]
      );
    }
    return groupId;
  });

  res.status(201).json(await persistentGroup(created, req.user.id));
}));

groupCallRoutes.delete('/groups/:groupId', auth, h(async (req, res) => {
  const groupId = String(req.params.groupId || '');
  if (!UUID_RE.test(groupId)) throw notFound('Grupo não encontrado');
  const group = await persistentGroup(groupId, req.user.id);
  if (!group || group.creator_id !== req.user.id) throw notFound('Grupo não encontrado');

  const { rows:active } = await q(
    `SELECT 1 FROM group_call_sessions
      WHERE group_id=$1 AND status IN ('ringing','active') LIMIT 1`,
    [groupId]
  );
  if (active[0]) throw bad('Termina a videochamada antes de apagar o grupo', 'group_call_active');

  const { rows } = await q(
    `DELETE FROM group_call_groups WHERE id=$1 AND creator_id=$2 RETURNING id`,
    [groupId, req.user.id]
  );
  if (!rows[0]) throw notFound('Grupo não encontrado');
  res.json({ deleted:true });
}));

// Chamadas novas usam threadId="group:<uuid>". room:<uuid> fica apenas para compatibilidade com grupos antigos.
groupCallRoutes.post('/', auth, (req, res, next) => {
  const dedicatedGroupId = groupThreadIdOf(req.body?.threadId);
  const legacyRoomId = roomIdOf(req.body?.threadId);
  if (!dedicatedGroupId && !legacyRoomId) return next();

  return h(async () => {
    if (String(req.body?.mode || 'video') !== 'video') throw bad('Chamadas de grupo são vídeo nesta versão');

    let parent;
    let members;
    let scopeColumn;
    let scopeId;
    if (dedicatedGroupId) {
      parent = await eligibleGroup(dedicatedGroupId, req.user.id);
      members = await persistentGroupMembers(parent.id, req.user.id);
      scopeColumn = 'group_id';
      scopeId = parent.id;
    } else {
      parent = await eligibleRoom(legacyRoomId, req.user.id);
      members = await legacyRoomMembers(parent.id, req.user.id);
      scopeColumn = 'room_id';
      scopeId = parent.id;
    }

    if (members.length < 2) throw bad('Adiciona pelo menos uma pessoa ao grupo antes de ligar');

    const created = await tx(async c => {
      await c.query(
        `UPDATE group_call_sessions SET status='ended',ended_at=now()
          WHERE ${scopeColumn}=$1 AND status IN ('ringing','active')`,
        [scopeId]
      );
      const { rows } = await c.query(
        `INSERT INTO group_call_sessions (${scopeColumn},initiator_id,mode)
         VALUES ($1,$2,'video') RETURNING *`,
        [scopeId, req.user.id]
      );
      const call = rows[0];
      for (const member of members) {
        await c.query(
          `INSERT INTO group_call_participants (call_id,user_id,status,joined_at)
           VALUES ($1,$2,$3,CASE WHEN $3='joined' THEN now() ELSE NULL END)`,
          [call.id, member.id, member.id === req.user.id ? 'joined' : 'invited']
        );
      }
      return call;
    });

    const targets = members.filter(member => member.id !== req.user.id);
    const deliveries = await Promise.all(targets.map(async member => {
      const [ready, push] = await Promise.all([
        pushReadyFor(member.id),
        sendPushToUser(member.id, {
          notification:{
            title:`${req.user.name || req.user.handle} iniciou uma chamada`,
            body:`Videochamada no grupo ${parent.name}`,
            tag:`lumina:group-call:${created.id}`,
            url:`/?tab=dms&call=${encodeURIComponent(`${GROUP_PREFIX}${created.id}`)}`,
          },
        }).catch(() => ({ attempted:0, accepted:0 })),
      ]);
      return { id:member.id, ready, attempted:push.attempted || 0, accepted:push.accepted || 0 };
    }));

    const hydrated = {
      ...created,
      group_name:parent.name,
      group_image:parent.image_url || null,
      self_joined_at:new Date().toISOString(),
    };
    const out = await publicGroupCall(hydrated, req.user.id);
    res.status(201).json({
      ...out,
      group_size:members.length,
      push_attempted:deliveries.reduce((sum,item)=>sum+item.attempted,0),
      push_accepted:deliveries.reduce((sum,item)=>sum+item.accepted,0),
      callee_push_ready:deliveries.some(item=>item.ready),
    });
  })(req, res, next);
});

// Uma chamada de grupo pendente tem prioridade; se não existir, deixa a rota 1:1 responder.
groupCallRoutes.get('/incoming', auth, (req, res, next) => h(async () => {
  const { rows } = await q(
    `SELECT gc.*,
            COALESCE(gg.name,r.name) AS group_name,
            COALESCE(gg.image_url,r.image_url) AS group_image,
            gp.joined_at AS self_joined_at
       FROM group_call_participants gp
       JOIN group_call_sessions gc ON gc.id=gp.call_id
       LEFT JOIN group_call_groups gg ON gg.id=gc.group_id
       LEFT JOIN rooms r ON r.id=gc.room_id
      WHERE gp.user_id=$1 AND gp.status='invited'
        AND gc.status IN ('ringing','active')
        AND gc.created_at > now()-interval '3 minutes'
      ORDER BY gc.created_at DESC LIMIT 1`,
    [req.user.id]
  );
  const call = rows[0];
  if (!call) return next();
  await q(`UPDATE group_call_participants SET seen_at=COALESCE(seen_at,now()) WHERE call_id=$1 AND user_id=$2`, [call.id, req.user.id]);
  res.json(await publicGroupCall(call, req.user.id));
})(req, res, next));

function groupRoute(handler) {
  return [auth, (req, res, next) => {
    if (!groupIdOf(req.params.callId)) return next();
    return h(handler)(req, res, next);
  }];
}

groupCallRoutes.get('/:callId', ...groupRoute(async (req, res) => {
  const call = await groupCall(req.params.callId, req.user.id);
  res.json(await publicGroupCall(call, req.user.id));
}));

groupCallRoutes.post('/:callId/answer', ...groupRoute(async (req, res) => {
  const call = await groupCall(req.params.callId, req.user.id);
  if (call.status === 'ended') throw bad('A chamada terminou');
  if (!['invited','joined'].includes(call.participant_status)) throw bad('Já não podes entrar nesta chamada');

  await tx(async c => {
    await c.query(
      `UPDATE group_call_participants
          SET status='joined',seen_at=COALESCE(seen_at,now()),joined_at=COALESCE(joined_at,now()),left_at=NULL
        WHERE call_id=$1 AND user_id=$2`,
      [call.id, req.user.id]
    );
    await c.query(`UPDATE group_call_sessions SET status='active',started_at=COALESCE(started_at,now()) WHERE id=$1 AND status<>'ended'`, [call.id]);
    if (call.room_id) {
      await c.query(
        `INSERT INTO room_members (room_id,user_id,role)
         VALUES ($1,$2,'member') ON CONFLICT (room_id,user_id) DO NOTHING`,
        [call.room_id, req.user.id]
      );
      await c.query(`UPDATE room_invites SET accepted_at=COALESCE(accepted_at,now()) WHERE room_id=$1 AND user_id=$2`, [call.room_id, req.user.id]);
    }
  });
  const refreshed = await groupCall(req.params.callId, req.user.id);
  res.json(await publicGroupCall(refreshed, req.user.id));
}));

groupCallRoutes.post('/:callId/decline', ...groupRoute(async (req, res) => {
  const call = await groupCall(req.params.callId, req.user.id);
  if (call.participant_status === 'invited') {
    await q(`UPDATE group_call_participants SET status='declined',seen_at=COALESCE(seen_at,now()),left_at=now() WHERE call_id=$1 AND user_id=$2`, [call.id, req.user.id]);
  }
  res.json({ declined:true });
}));

groupCallRoutes.post('/:callId/end', ...groupRoute(async (req, res) => {
  const call = await groupCall(req.params.callId, req.user.id);
  if (call.status === 'ended') return res.json({ ended:true });

  await tx(async c => {
    await c.query(`UPDATE group_call_participants SET status='left',left_at=now() WHERE call_id=$1 AND user_id=$2 AND status IN ('joined','invited')`, [call.id, req.user.id]);
    await c.query(
      `INSERT INTO group_call_signals (call_id,sender_id,recipient_id,kind,payload)
       SELECT $1,$2,user_id,'hangup','{}'::jsonb
         FROM group_call_participants
        WHERE call_id=$1 AND user_id<>$2 AND status='joined'`,
      [call.id, req.user.id]
    );
    const { rows } = await c.query(`SELECT count(*)::int AS joined FROM group_call_participants WHERE call_id=$1 AND status='joined'`, [call.id]);
    const stopRinging = call.initiator_id === req.user.id && call.status === 'ringing';
    if (stopRinging || Number(rows[0]?.joined || 0) === 0) {
      await c.query(`UPDATE group_call_sessions SET status='ended',ended_at=now() WHERE id=$1`, [call.id]);
      if (stopRinging) await c.query(`UPDATE group_call_participants SET status='left',left_at=now() WHERE call_id=$1 AND status='invited'`, [call.id]);
    }
  });
  res.json({ ended:true });
}));

groupCallRoutes.get('/:callId/sync', ...groupRoute(async (req, res) => {
  const call = await groupCall(req.params.callId, req.user.id);
  const rawAfter = req.query.after === undefined ? 0 : Number(req.query.after);
  if (!Number.isSafeInteger(rawAfter) || rawAfter < 0) throw bad('Cursor de sinal inválido', 'bad_cursor');
  if (call.participant_status === 'invited') {
    await q(`UPDATE group_call_participants SET seen_at=COALESCE(seen_at,now()) WHERE call_id=$1 AND user_id=$2`, [call.id, req.user.id]);
  }
  const [{ rows:signals }, participants] = await Promise.all([
    q(
      `SELECT id,sender_id,kind,payload,created_at
         FROM group_call_signals
        WHERE call_id=$1 AND recipient_id=$2 AND id>$3
        ORDER BY id ASC LIMIT 300`,
      [call.id, req.user.id, rawAfter]
    ),
    participantsFor(call.id),
  ]);
  res.json({
    group:true,
    status:call.status,
    answeredAt:call.started_at,
    endedAt:call.ended_at,
    selfId:req.user.id,
    selfJoinedAt:call.self_joined_at,
    participants,
    signals,
  });
}));

groupCallRoutes.post('/:callId/signals', ...groupRoute(async (req, res) => {
  const call = await groupCall(req.params.callId, req.user.id);
  if (call.status === 'ended' || call.participant_status !== 'joined') throw bad('A chamada terminou');
  const kind = String(req.body.kind || '');
  if (!['offer','answer','ice','hangup'].includes(kind)) throw bad('Sinal inválido');
  const wrapper = req.body.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
  const recipientId = String(wrapper.to || '');
  if (!recipientId || recipientId === req.user.id) throw bad('Destinatário de sinal inválido');
  const { rows:allowed } = await q(`SELECT 1 FROM group_call_participants WHERE call_id=$1 AND user_id=$2 AND status='joined'`, [call.id, recipientId]);
  if (!allowed[0]) throw forbidden('Esta pessoa já não está na chamada');
  const payload = Object.hasOwn(wrapper, 'data') ? wrapper.data : null;
  const { rows } = await q(
    `INSERT INTO group_call_signals (call_id,sender_id,recipient_id,kind,payload)
     VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id,kind,payload,created_at`,
    [call.id, req.user.id, recipientId, kind, JSON.stringify(payload)]
  );
  res.status(201).json(rows[0]);
}));

groupCallRoutes.get('/:callId/signals', ...groupRoute(async (req, res) => {
  const call = await groupCall(req.params.callId, req.user.id);
  const rawAfter = req.query.after === undefined ? 0 : Number(req.query.after);
  if (!Number.isSafeInteger(rawAfter) || rawAfter < 0) throw bad('Cursor de sinal inválido', 'bad_cursor');
  const { rows } = await q(
    `SELECT id,sender_id,kind,payload,created_at
       FROM group_call_signals
      WHERE call_id=$1 AND recipient_id=$2 AND id>$3
      ORDER BY id ASC LIMIT 300`,
    [call.id, req.user.id, rawAfter]
  );
  res.json(rows);
}));
