import { q } from '../db.js';
import { nativePushConfigured, sendNativePush } from '../lib/nativepush.js';

let started = false;
let running = false;
let timer = null;

const copy = {
  pt:{
    someone:'Alguém', photo:'uma fotografia', video:'um vídeo', message:'Enviou-te uma mensagem', sent:'Enviou-te',
    call:'Chamada de', videoCall:'Videochamada recebida', audioCall:'Chamada de áudio recebida',
    follow:'quer ligar-se à tua luz', room:'Convite para uma Sala', roomBody:'convidou-te para uma Sala',
    activity:'interagiu com a tua publicação', new:'Tens uma novidade.'
  },
  fr:{
    someone:'Quelqu’un', photo:'une photo', video:'une vidéo', message:'T’a envoyé un message', sent:'T’a envoyé',
    call:'Appel de', videoCall:'Appel vidéo entrant', audioCall:'Appel audio entrant',
    follow:'veut se connecter à ta lumière', room:'Invitation à un Salon', roomBody:'t’a invité dans un Salon',
    activity:'a interagi avec ta publication', new:'Tu as une nouveauté.'
  },
  en:{
    someone:'Someone', photo:'a photo', video:'a video', message:'Sent you a message', sent:'Sent you',
    call:'Call from', videoCall:'Incoming video call', audioCall:'Incoming audio call',
    follow:'wants to connect with your light', room:'Room invitation', roomBody:'invited you to a Room',
    activity:'interacted with your post', new:'You have something new.'
  },
  es:{
    someone:'Alguien', photo:'una foto', video:'un vídeo', message:'Te ha enviado un mensaje', sent:'Te ha enviado',
    call:'Llamada de', videoCall:'Videollamada entrante', audioCall:'Llamada de audio entrante',
    follow:'quiere conectar con tu luz', room:'Invitación a una Sala', roomBody:'te ha invitado a una Sala',
    activity:'ha interactuado con tu publicación', new:'Tienes una novedad.'
  },
};

function languageOf(value) {
  const lang = String(value || 'pt').trim().toLowerCase().slice(0, 2);
  return copy[lang] ? lang : 'pt';
}

function noticeFor(row) {
  const type = row.type || 'activity';
  const data = row.data || {};
  const text = copy[languageOf(row.locale)];
  const actor = row.actor_name || text.someone;

  if (type === 'message') {
    const media = data.kind === 'media';
    const mediaName = data.mediaType === 'video' ? text.video : text.photo;
    return {
      title:actor,
      body:media ? `${text.sent} ${mediaName}` : text.message,
      tag:`lumina:message:${data.threadId || row.id}`,
      type,
      url:'/?tab=dms',
    };
  }
  if (type === 'incoming_call') {
    return {
      title:`${text.call} ${actor}`,
      body:data.mode === 'video' ? text.videoCall : text.audioCall,
      tag:`lumina:call:${data.callId || row.id}`,
      type,
      url:`/?tab=dms${data.callId ? `&call=${encodeURIComponent(data.callId)}` : ''}`,
    };
  }
  if (type === 'follow' || type === 'follow_request') {
    return { title:'Lumina', body:`${actor} ${text.follow}`, tag:`lumina:${type}:${row.id}`, type, url:'/?tab=alerts' };
  }
  if (type === 'room_invite') {
    return { title:text.room, body:`${actor} ${text.roomBody}`, tag:`lumina:room:${row.id}`, type, url:'/?tab=rooms' };
  }
  if (type === 'comment' || type === 'like') {
    return { title:'Lumina', body:`${actor} ${text.activity}`, tag:`lumina:${type}:${row.id}`, type, url:'/?tab=alerts' };
  }
  return { title:'Lumina', body:text.new, tag:`lumina:${type}:${row.id}`, type, url:'/?tab=alerts' };
}

async function cycle() {
  if (running) return;
  running = true;
  try {
    const { rows } = await q(
      `SELECT n.id,n.user_id,COALESCE(n.type,n.kind) AS type,
              CASE WHEN n.type IS NULL THEN COALESCE(n.payload,'{}'::jsonb) ELSE n.data END AS data,
              a.name AS actor_name,
              t.token,t.platform,t.locale,
              (SELECT count(*)::int FROM notifications unread WHERE unread.user_id=n.user_id AND unread.read_at IS NULL) AS badge
         FROM notifications n
         JOIN native_push_tokens t ON t.user_id=n.user_id
         LEFT JOIN users a ON a.id=n.actor_id
         LEFT JOIN native_push_deliveries d ON d.notification_id=n.id AND d.token=t.token
        WHERE (d.notification_id IS NULL OR (d.delivered_at IS NULL AND d.attempted_at < now()-interval '45 seconds'))
          AND n.created_at > now()-interval '10 minutes'
        ORDER BY n.created_at ASC
        LIMIT 40`
    );

    for (const row of rows) {
      if (!nativePushConfigured(row.platform)) continue;
      const claimed = await q(
        `INSERT INTO native_push_deliveries (notification_id,token)
         VALUES ($1,$2)
         ON CONFLICT (notification_id,token) DO UPDATE
           SET attempted_at=now(), status=NULL, error=NULL
         WHERE native_push_deliveries.delivered_at IS NULL
           AND native_push_deliveries.attempted_at < now()-interval '45 seconds'
         RETURNING notification_id`,
        [row.id, row.token]
      );
      if (!claimed.rows[0]) continue;

      try {
        const result = await sendNativePush(row, noticeFor(row), row.badge);
        if (result.stale) {
          await q('DELETE FROM native_push_tokens WHERE token=$1', [row.token]);
          continue;
        }
        await q(
          `UPDATE native_push_deliveries
              SET delivered_at=CASE WHEN $3::boolean THEN now() ELSE NULL END,
                  status=$4,
                  error=$5
            WHERE notification_id=$1 AND token=$2`,
          [row.id, row.token, !!result.accepted, Number(result.status || 0), result.error ? String(result.error).slice(0,1000) : null]
        );
      } catch (error) {
        await q(
          `UPDATE native_push_deliveries SET status=0,error=$3
            WHERE notification_id=$1 AND token=$2`,
          [row.id, row.token, String(error?.message || error).slice(0,1000)]
        ).catch(() => {});
      }
    }
  } catch (error) {
    if (!/native_push_/i.test(String(error?.message || ''))) console.debug('[native-push] worker', error?.message);
  } finally {
    running = false;
  }
}

export function startNativePushWorker() {
  if (started) return;
  started = true;
  const launch = setTimeout(() => {
    cycle().catch(() => {});
    timer = setInterval(() => cycle().catch(() => {}), 2500);
    timer.unref?.();
  }, 10_000);
  launch.unref?.();
}
