import cron from 'node-cron';
import { q, tx } from '../db.js';
import { removeObject } from '../lib/storage.js';
import { uploadReferenceCount, removeUploadIfUnreferenced } from '../lib/uploads.js';

/** Roda os convites diários de acordo com o fuso da comunidade. */
export async function rotateInvites() {
  const { rows: communities } = await q(
    `SELECT c.id, c.slug, c.timezone,
            (now() AT TIME ZONE c.timezone)::date AS local_date
     FROM communities c
     WHERE NOT EXISTS (
       SELECT 1 FROM invites i
       WHERE i.community_id = c.id
         AND i.local_date = (now() AT TIME ZONE c.timezone)::date
     )`
  );

  let created = 0;
  for (const com of communities) {
    try {
      await tx(async (c) => {
        const { rows: pick } = await c.query(
          `SELECT id, text, author_id FROM proposals
           WHERE community_id = $1 AND used_at IS NULL AND hidden_at IS NULL
           ORDER BY vote_count DESC, is_seed DESC, created_at ASC
           LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [com.id]
        );
        if (!pick[0]) return;

        await c.query(
          `INSERT INTO invites
             (community_id, proposal_id, text, author_id, local_date, opens_at, closes_at)
           VALUES (
             $1, $2, $3, $4, $5::date,
             ($5::date::timestamp AT TIME ZONE $6),
             (($5::date + 1)::timestamp AT TIME ZONE $6)
           )
           ON CONFLICT (community_id, local_date) DO NOTHING`,
          [com.id, pick[0].id, pick[0].text, pick[0].author_id, com.local_date, com.timezone]
        );

        await c.query('UPDATE proposals SET used_at = now() WHERE id = $1', [pick[0].id]);
        created++;
      });
    } catch (err) {
      console.error(`[convites] falhou em ${com.slug}:`, err.message);
    }
  }
  if (created) console.log(`[convites] ${created} convites abertos`);
  return created;
}

/**
 * Apaga de verdade mensagens expiradas.
 *
 * Para uploads novos com purpose=message sabemos que o objeto foi consumido
 * exclusivamente por essa mensagem. Apagamos o objeto físico antes de marcar
 * a mensagem como purgada; se o storage falhar, a linha fica pendente e o job
 * volta a tentar no minuto seguinte.
 *
 * Dados legacy podem ter reutilizado a mesma URL antes de existir a regra de
 * consumo único. Nesses casos só apagamos o objeto antecipadamente se esta for
 * a última referência; caso contrário retiramos o conteúdo desta mensagem e o
 * objeto será removido quando desaparecer a última referência legítima.
 */
export async function purgeMessages() {
  const { rows } = await q(
    `SELECT id, media_url FROM messages
     WHERE purged_at IS NULL AND expires_at IS NOT NULL AND expires_at < now()
     ORDER BY expires_at LIMIT 500`
  );

  let purged = 0;
  for (const message of rows) {
    const url = message.media_url;
    let storageRemoved = false;

    try {
      if (url) {
        const { rows: uploads } = await q(
          'SELECT key, purpose FROM uploads WHERE url = $1', [url]
        );
        const upload = uploads[0];
        if (upload) {
          const refs = await uploadReferenceCount(url);
          if (upload.purpose === 'message' || refs <= 1) {
            await removeObject(upload.key);
            storageRemoved = true;
          }
        }
      }

      const { rowCount } = await q(
        `UPDATE messages
         SET body = NULL, media_url = NULL, purged_at = now()
         WHERE id = $1 AND purged_at IS NULL`,
        [message.id]
      );
      if (!rowCount) continue;

      if (url) {
        // Se já apagámos o objeto, a segunda remoção é idempotente e elimina a
        // linha uploads. Se era legacy partilhado, só remove quando refs=0.
        await removeUploadIfUnreferenced(url).catch(err => {
          console.error('[mensagens] media órfão fica para retry:', err.message);
        });
      }
      purged++;
    } catch (err) {
      // Se o objeto exclusivo não saiu do storage, não declaramos a mensagem
      // purgada. `storageRemoved` serve apenas para tornar explícita a escolha:
      // remover media primeiro é preferível a manter um URL secreto acessível.
      console.error(`[mensagens] falhou apagar ${message.id}${storageRemoved ? ' após remover media' : ''}:`, err.message);
    }
  }

  if (purged) console.log(`[mensagens] ${purged} apagadas`);
  return purged;
}

/**
 * Momentos duram 24 h. Para uploads novos, o objeto físico sai antes da linha;
 * falha no storage deixa o momento expirado invisível mas pendente para retry.
 */
export async function purgeMoments() {
  const { rows } = await q(
    `SELECT id, media_url FROM moments
     WHERE expires_at < now() ORDER BY expires_at LIMIT 500`
  );

  let purged = 0;
  for (const moment of rows) {
    const url = moment.media_url;
    try {
      if (url) {
        const { rows: uploads } = await q(
          'SELECT key, purpose FROM uploads WHERE url = $1', [url]
        );
        const upload = uploads[0];
        if (upload) {
          const refs = await uploadReferenceCount(url);
          if (upload.purpose === 'moment' || refs <= 1) {
            await removeObject(upload.key);
          }
        }
      }

      const { rowCount } = await q('DELETE FROM moments WHERE id = $1 AND expires_at < now()', [moment.id]);
      if (!rowCount) continue;

      if (url) {
        await removeUploadIfUnreferenced(url).catch(err => {
          console.error('[momentos] media órfão fica para retry:', err.message);
        });
      }
      purged++;
    } catch (err) {
      console.error(`[momentos] falhou apagar ${moment.id}:`, err.message);
    }
  }

  if (purged) console.log(`[momentos] ${purged} expirados`);
  return purged;
}

/** Upload iniciado mas nunca confirmado. */
export async function purgeStaleUploads() {
  const { rows } = await q(
    `SELECT id, key FROM uploads
     WHERE confirmed_at IS NULL AND created_at < now() - interval '2 hours'
     ORDER BY created_at LIMIT 500`
  );

  let removed = 0;
  for (const upload of rows) {
    try {
      await removeObject(upload.key);
      await q('DELETE FROM uploads WHERE id = $1 AND confirmed_at IS NULL', [upload.id]);
      removed++;
    } catch (err) {
      console.error(`[uploads] falhou a limpar ${upload.key}:`, err.message);
    }
  }
  if (removed) console.log(`[uploads] ${removed} uploads incompletos removidos`);
  return removed;
}

/**
 * Upload confirmado mas abandonado, ou upload consumido cuja referência já
 * desapareceu. Também funciona como retry para uma limpeza física que tenha
 * falhado depois de apagar um Post/Momento/avatar da base.
 */
export async function purgeOrphanUploads() {
  const { rows } = await q(
    `SELECT id, key, url FROM uploads
     WHERE confirmed_at IS NOT NULL
       AND created_at < now() - interval '2 hours'
     ORDER BY created_at LIMIT 500`
  );

  let removed = 0;
  for (const upload of rows) {
    try {
      if (await uploadReferenceCount(upload.url)) continue;
      await removeObject(upload.key);
      const { rowCount } = await q(
        `DELETE FROM uploads WHERE id = $1
         AND NOT EXISTS (SELECT 1 FROM users WHERE avatar_url = $2)
         AND NOT EXISTS (SELECT 1 FROM posts WHERE media_url = $2)
         AND NOT EXISTS (SELECT 1 FROM moments WHERE media_url = $2)
         AND NOT EXISTS (SELECT 1 FROM messages WHERE media_url = $2)`,
        [upload.id, upload.url]
      );
      removed += rowCount;
    } catch (err) {
      console.error(`[uploads] órfão ${upload.key} fica para retry:`, err.message);
    }
  }
  if (removed) console.log(`[uploads] ${removed} órfãos removidos`);
  return removed;
}

/**
 * RGPD artigo 17: executa apagamentos cujo prazo de 30 dias terminou.
 *
 * Os objetos físicos saem antes da conta. Reposts ou qualquer referência
 * legacy feita por outra conta perde a URL no mesmo ciclo: o conteúdo da
 * pessoa apagada não fica preservado por uma cópia derivada.
 */
export async function runAccountDeletions() {
  const { rows } = await q(
    `SELECT user_id FROM deletion_requests
     WHERE cancelled_at IS NULL AND execute_at < now()`
  );

  let deleted = 0;
  for (const r of rows) {
    try {
      const { rows: files } = await q(
        'SELECT key, url FROM uploads WHERE owner_id = $1', [r.user_id]
      );
      for (const file of files) await removeObject(file.key);
      const urls = files.map(file => file.url);

      await tx(async (c) => {
        const { rows: memberships } = await c.query(
          'SELECT community_id FROM memberships WHERE user_id = $1', [r.user_id]
        );
        const affected = memberships.map(m => m.community_id);

        const { rows: founded } = await c.query(
          'SELECT id FROM communities WHERE founder_id = $1 FOR UPDATE', [r.user_id]
        );

        for (const community of founded) {
          const { rows: next } = await c.query(
            `SELECT user_id FROM memberships
             WHERE community_id = $1 AND user_id <> $2
             ORDER BY CASE role WHEN 'moderator' THEN 0 ELSE 1 END, joined_at ASC
             LIMIT 1`,
            [community.id, r.user_id]
          );

          if (next[0]) {
            await c.query(
              `UPDATE memberships SET role = 'founder'
               WHERE community_id = $1 AND user_id = $2`,
              [community.id, next[0].user_id]
            );
            await c.query('UPDATE communities SET founder_id = $2 WHERE id = $1',
              [community.id, next[0].user_id]);
          } else {
            await c.query('DELETE FROM communities WHERE id = $1', [community.id]);
          }
        }

        // Reposts podem copiar media_url do post original. Ao apagar o dono do
        // ficheiro, uma cópia derivada não pode mantê-lo vivo.
        if (urls.length) {
          await c.query(
            'UPDATE posts SET media_url = NULL WHERE author_id <> $1 AND media_url = ANY($2::text[])',
            [r.user_id, urls]
          );
          // Estes casos não são produzidos pelo cliente atual (ownership era
          // validado), mas limpam dados legacy caso tenham existido.
          await c.query(
            'UPDATE messages SET media_url = NULL WHERE sender_id <> $1 AND media_url = ANY($2::text[])',
            [r.user_id, urls]
          );
          await c.query(
            'UPDATE moments SET media_url = NULL WHERE author_id <> $1 AND media_url = ANY($2::text[])',
            [r.user_id, urls]
          );
          await c.query(
            'UPDATE users SET avatar_url = NULL WHERE id <> $1 AND avatar_url = ANY($2::text[])',
            [r.user_id, urls]
          );
        }

        await c.query('DELETE FROM users WHERE id = $1', [r.user_id]);

        if (affected.length) {
          await c.query(
            `UPDATE communities c
             SET member_count = (SELECT count(*)::int FROM memberships m WHERE m.community_id = c.id)
             WHERE c.id = ANY($1::uuid[])`,
            [affected]
          );
        }
      });

      deleted++;
      console.log(`[rgpd] conta apagada: ${r.user_id}`);
    } catch (err) {
      console.error(`[rgpd] falhou apagar ${r.user_id}; fica pendente para nova tentativa:`, err.message);
    }
  }
  return deleted;
}

export async function purgeExpiredTokens() {
  const { rowCount } = await q(
    `DELETE FROM password_resets WHERE expires_at < now() - interval '7 days'`
  );
  if (rowCount) console.log(`[tokens] ${rowCount} pedidos de recuperação expirados removidos`);
  return rowCount;
}

export async function purgeOldLoginAttempts() {
  const { rowCount } = await q(
    `DELETE FROM login_attempts WHERE created_at < now() - interval '90 days'`
  );
  if (rowCount) console.log(`[login] ${rowCount} tentativas antigas removidas`);
  return rowCount;
}

export function startJobs() {
  if (process.env.RUN_JOBS_IN_PROCESS === 'false') {
    console.log('[jobs] desligados neste processo — a correr como cron externo');
    return;
  }
  cron.schedule('2 * * * *', () => rotateInvites().catch(console.error));
  cron.schedule('* * * * *', () => purgeMessages().catch(console.error));
  cron.schedule('15 * * * *', () => purgeMoments().catch(console.error));
  cron.schedule('35 * * * *', () => purgeStaleUploads().catch(console.error));
  cron.schedule('45 * * * *', () => purgeOrphanUploads().catch(console.error));
  cron.schedule('10 3 * * *', () => runAccountDeletions().catch(console.error));
  cron.schedule('20 3 * * *', () => purgeExpiredTokens().catch(console.error));
  cron.schedule('30 3 * * *', () => purgeOldLoginAttempts().catch(console.error));
  console.log('[jobs] agendados');
}
