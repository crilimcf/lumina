import { q } from '../db.js';
import { nativePushConfigured, sendNativePush } from '../lib/nativepush.js';

let started = false;
let running = false;
let timer = null;

function noticeFor(row) {
  const type = row.type || row.kind || 'activity';
  const data = row.data || row.payload || {};
  const actor = row.actor_name || 'Alguém';

  if (type === 'message') {
    const media = data.kind === 'media';
    const mediaName = data.mediaType === 'video' ? 'um vídeo' : 'uma fotografia';
    return {
      title:actor,
      body:media ? `Enviou-te ${mediaName}` : 'Enviou-te uma mensagem',
      tag:`lumina:message:${data.threadId || row.id}`,
      type,
      url:'/?tab=dms',
    };
  }
  if (type === 'incoming_call') {
    return {
      title:`Chamada de ${actor}`,
      body:data.mode === 'video' ? 'Videochamada recebida' : 'Chamada de áudio recebida',
      tag:`lumina:call:${data.callId || row.id}`,
      type,
      url:`/?tab=dms${data.callId ? `&call=${encodeURIComponent(data.callId)}` : ''}`,
    };
  }
  if (type === 'follow' || type === 'follow_request') {
    return { title:'Lumina', body:`${actor} quer ligar-se à tua luz`, tag:`lumina:${type}:${row.id}`, type, url:'/?tab=alerts' };
  }
  if (type === 'room_invite') {
    return { title:'Convite para uma Sala', body:`${actor} convidou-te para uma Sala`, tag:`lumina:room:${row.id}`, type, url:'/?tab=rooms' };
  }
  if (type === 'comment' || type === 'like') {
    return { title:'Lumina', body:`${actor} interagiu com a tua publicação`, tag:`lumina:${type}:${row.id}`, type, url:'/?tab=alerts' };
  }
  return { title:'Lumina', body:'Tens uma novidade.', tag:`lumina:${type}:${row.id}`, type, url:'/?tab=alerts' };
}

async function cycle() {
  if (running) return;
  running = true;
  try {
    const { rows } = await q(
      `SELECT n.id,n.user_id,COALESCE(n.type,n.kind) AS type,
              CASE WHEN n.type IS NULL THEN COALESCE(n.payload,'{}'::jsonb) ELSE n.data END AS data,
              a.name AS actor_name,
              t.token,t.platform,
              (SELECT count(*)::int FROM notifications unread WHERE unread.user_id=n.user_id AND unread.read_at IS NULL) AS badge
         FROM notifications n
         JOIN native_push_tokens t ON t.user_id=n.user_id
         LEFT JOIN users a ON a.id=n.actor_id
         LEFT JOIN native_push_deliveries d ON d.notification_id=n.id AND d.token=t.token
        WHERE d.notification_id IS NULL
          AND n.created_at > now()-interval '10 minutes'
        ORDER BY n.created_at ASC
        LIMIT 40`
    );

    for (const row of rows) {
      if (!nativePushConfigured(row.platform)) continue;
      const claimed = await q(
        `INSERT INTO native_push_deliveries (notification_id,token)
         VALUES ($1,$2)
         ON CONFLICT DO NOTHING
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
