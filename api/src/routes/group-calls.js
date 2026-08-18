import { Router } from 'express';
import { q, tx } from '../db.js';
import { auth, h, bad, forbidden, notFound } from '../middleware/auth.js';
import { sendPushToUser } from '../lib/webpush.js';

export const groupCallRoutes = Router();
const GROUP_PREFIX = 'g:';
const ROOM_PREFIX = 'room:';
const MAX_GROUP_PARTICIPANTS = 6;

const groupIdOf = value => String(value || '').startsWith(GROUP_PREFIX)
  ? String(value).slice(GROUP_PREFIX.length)
  : null;
const roomIdOf = value => String(value || '').startsWith(ROOM_PREFIX)
  ? String(value).slice(ROOM_PREFIX.length)
  : null;

async function groupCall(callId, userId, query = q) {
  const id = groupIdOf(callId);
  if (!id) return null;
  const { rows } = await query(
    `SELECT gc.*, r.name AS group_name, r.image_url AS group_image,
            gp.status AS participant_status, gp.joined_at AS self_joined_at
       FROM group_call_sessions gc
       JOIN rooms r ON r.id=gc.room_id
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
    room_id:call.room_id,
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
  if (!room || room.visibility !== 'private' || (!room.joined && !room.invited && room.creator_id !== userId)) {
    throw forbidden('Este grupo não está disponível');
  }
  return room;
}

async function groupMembers(roomId, initiatorId) {
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

// Interceta apenas chamadas iniciadas com threadId="room:<uuid>".
groupCallRoutes.post('/', auth, (req, res, next) => {
  const roomId = roomIdOf(req.body?.threadId);
  if (!roomId) return next();
  return h(async () => {
    if (String(req.body?.mode || 'video') !== 'video') throw bad('Chamadas de grupo são vídeo nesta versão');
    const room = await eligibleRoom(roomId, req.user.id);
    const members = await groupMembers(room.id, req.user.id);
    if (members.length < 2) throw bad('Adiciona pelo menos uma pessoa ao grupo antes de ligar');

    const created = await tx(async c => {
      await c.query(
        `UPDATE group_call_sessions SET status='ended',ended_at=now()
          WHERE room_id=$1 AND status IN ('ringing','active')`,
        [room.id]
      );
      const { rows } = await c.query(
        `INSERT INTO group_call_sessions (room_id,initiator_id,mode)
         VALUES ($1,$2,'video') RETURNING *`,
        [room.id, req.user.id]
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
            body:`Videochamada no grupo ${room.name}`,
            tag:`lumina:group-call:${created.id}`,
            url:`/?tab=dms&call=${encodeURIComponent(`${GROUP_PREFIX}${created.id}`)}`,
          },
        }).catch(() => ({ attempted:0, accepted:0 })),
      ]);
      return { id:member.id, ready, attempted:push.attempted || 0, accepted:push.accepted || 0 };
    }));

    const hydrated = { ...created, group_name:room.name, group_image:room.image_url, self_joined_at:new Date().toISOString() };
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
    `SELECT gc.*,r.name AS group_name,r.image_url AS group_image,gp.joined_at AS self_joined_at
       FROM group_call_participants gp
       JOIN group_call_sessions gc ON gc.id=gp.call_id
       JOIN rooms r ON r.id=gc.room_id
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
    await c.query(
      `INSERT INTO room_members (room_id,user_id,role)
       VALUES ($1,$2,'member') ON CONFLICT (room_id,user_id) DO NOTHING`,
      [call.room_id, req.user.id]
    );
    await c.query(`UPDATE room_invites SET accepted_at=COALESCE(accepted_at,now()) WHERE room_id=$1 AND user_id=$2`, [call.room_id, req.user.id]);
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
