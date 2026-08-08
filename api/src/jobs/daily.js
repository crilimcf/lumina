import cron from 'node-cron';
import { q, tx } from '../db.js';
import { removeObject } from '../lib/storage.js';

/**
 * Roda os convites diários.
 *
 * Corre de hora a hora e trata as comunidades cuja meia-noite local já passou
 * sem terem convite para o dia de hoje. É por isso que o fuso vive na
 * comunidade e não no servidor: cada uma vira o dia à sua hora, sempre a mesma,
 * e o convite passa a ser um encontro marcado em vez de uma hora à deriva.
 */
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
        // Bloqueia a proposta escolhida para não haver corrida entre instâncias.
        const { rows: pick } = await c.query(
          `SELECT id, text, author_id FROM proposals
           WHERE community_id = $1 AND used_at IS NULL AND hidden_at IS NULL
           ORDER BY vote_count DESC, is_seed DESC, created_at ASC
           LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [com.id]
        );

        // Comunidade sem propostas: fica sem convite hoje em vez de repetir um.
        // Se acontecer, é sinal para avisar os moderadores — não para inventar.
        if (!pick[0]) return;

        // opens_at é a meia-noite local do dia; closes_at é a meia-noite seguinte.
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
 * Apaga a sério o conteúdo das mensagens expiradas.
 *
 * Esconder no cliente não é apagar. Se a promessa é que a mensagem desaparece,
 * o texto e o ficheiro têm de sair do servidor — fica só o registo de que
 * existiu, para a conversa fazer sentido.
 */
export async function purgeMessages() {
  const { rowCount } = await q(
    `UPDATE messages
     SET body = NULL, media_url = NULL, purged_at = now()
     WHERE purged_at IS NULL AND expires_at IS NOT NULL AND expires_at < now()`
  );
  if (rowCount) console.log(`[mensagens] ${rowCount} apagadas`);
  return rowCount;
}

/** Momentos duram 24 h. Passado isso saem da base. */
export async function purgeMoments() {
  const { rowCount } = await q('DELETE FROM moments WHERE expires_at < now()');
  if (rowCount) console.log(`[momentos] ${rowCount} expirados`);
  return rowCount;
}

/**
 * Remove objetos que receberam uma assinatura de upload mas nunca chegaram a
 * ser confirmados. Isto fecha a janela em que um cliente alterado podia pedir
 * URLs válidos, enviar lixo para o bucket e abandonar a confirmação.
 */
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
 * RGPD artigo 17: executa os apagamentos de conta cujo prazo de
 * arrependimento (30 dias) já passou.
 *
 * Sem isto correr nalgum lado, "a conta será apagada dentro de 30 dias" é uma
 * promessa que a app faz e não cumpre — o pedido fica agendado para sempre.
 */
export async function runAccountDeletions() {
  const { rows } = await q(
    `SELECT user_id FROM deletion_requests
     WHERE cancelled_at IS NULL AND execute_at < now()`
  );
  for (const r of rows) {
    // ON DELETE CASCADE trata do resto: posts, mensagens, votos, tudo.
    await q('DELETE FROM users WHERE id = $1', [r.user_id]);
    console.log(`[rgpd] conta apagada: ${r.user_id}`);
  }
  return rows.length;
}

/** Tokens de recuperação de password expirados há mais de 7 dias. */
export async function purgeExpiredTokens() {
  const { rowCount } = await q(
    `DELETE FROM password_resets WHERE expires_at < now() - interval '7 days'`
  );
  if (rowCount) console.log(`[tokens] ${rowCount} pedidos de recuperação expirados removidos`);
  return rowCount;
}

/**
 * Tentativas de entrada com mais de 90 dias.
 * A política de privacidade promete este prazo; sem limpeza, a promessa não
 * é cumprida e a tabela cresce para sempre.
 */
export async function purgeOldLoginAttempts() {
  const { rowCount } = await q(
    `DELETE FROM login_attempts WHERE created_at < now() - interval '90 days'`
  );
  if (rowCount) console.log(`[login] ${rowCount} tentativas antigas removidas`);
  return rowCount;
}

/**
 * Agenda os trabalhos dentro do processo da API.
 *
 * So faz sentido se o servico estiver sempre acordado. Num plano que adormece
 * por inatividade, usa antes `scripts/cron.js` como processo separado e poe
 * RUN_JOBS_IN_PROCESS=false.
 */
export function startJobs() {
  if (process.env.RUN_JOBS_IN_PROCESS === 'false') {
    console.log('[jobs] desligados neste processo — a correr como cron externo');
    return;
  }
  // De hora a hora: apanha a meia-noite de qualquer fuso, incluindo os de :30 e :45.
  cron.schedule('2 * * * *', () => rotateInvites().catch(console.error));
  // De minuto a minuto: as efémeras têm de sair depressa.
  cron.schedule('* * * * *', () => purgeMessages().catch(console.error));
  cron.schedule('15 * * * *', () => purgeMoments().catch(console.error));
  // Uploads nunca confirmados não ficam indefinidamente no armazenamento.
  cron.schedule('35 * * * *', () => purgeStaleUploads().catch(console.error));
  // Uma vez por dia: apagamentos de conta e limpeza de dados que passaram o prazo de retenção.
  cron.schedule('10 3 * * *', () => runAccountDeletions().catch(console.error));
  cron.schedule('20 3 * * *', () => purgeExpiredTokens().catch(console.error));
  cron.schedule('30 3 * * *', () => purgeOldLoginAttempts().catch(console.error));
  console.log('[jobs] agendados');
}
