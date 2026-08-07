import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, notFound } from '../middleware/auth.js';
import { sendEmail } from '../lib/email.js';

export const accountRoutes = Router();

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

/**
 * Pedir recuperação de password.
 *
 * Responde sempre igual, exista a conta ou não: senão a rota transforma-se num
 * verificador de quem tem conta na Lumina.
 */
accountRoutes.post('/forgot-password', h(async (req, res) => {
  const email = String(req.body.email || '').trim();
  const { rows } = await q('SELECT id, name FROM users WHERE email = $1', [email]);

  if (rows[0]) {
    const token = crypto.randomBytes(32).toString('base64url');
    await q(
      `INSERT INTO password_resets (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + interval '1 hour')`,
      [hashToken(token), rows[0].id]
    );
    await sendEmail({
      to: email,
      subject: 'Recuperar a tua password',
      text: `Olá ${rows[0].name},\n\nAbre esta ligação para escolher uma password nova:\n${env.APP_URL}/recuperar?token=${token}\n\nExpira dentro de uma hora. Se não foste tu, ignora este email.`,
    });
  }

  res.json({ ok: true, message: 'Se essa conta existir, enviámos um email.' });
}));

accountRoutes.post('/reset-password', h(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) throw bad('Faltam campos');
  if (String(password).length < 8) throw bad('A password precisa de 8 caracteres ou mais');

  await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT user_id FROM password_resets
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
      [hashToken(token)]
    );
    if (!rows[0]) throw bad('Ligação inválida ou expirada', 'invalid_token');

    // session_version sobe: todos os tokens emitidos antes deixam de servir.
    // Sem isto, quem roubou a password mantinha a sessao aberta mesmo depois
    // de a vitima a trocar — que e exatamente quando ela precisa de a fechar.
    await c.query(
      'UPDATE users SET password_hash = $2, session_version = session_version + 1 WHERE id = $1',
      [rows[0].user_id, await bcrypt.hash(password, 12)]);
    await c.query('UPDATE password_resets SET used_at = now() WHERE token_hash = $1', [hashToken(token)]);
    // Invalida os outros pedidos pendentes da mesma conta.
    await c.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [rows[0].user_id]);
  });

  res.json({ ok: true });
}));

/**
 * RGPD, artigo 20: exportar os dados em formato legível por máquina.
 * Não é opcional na UE, e é mais fácil construir agora do que remendar depois.
 */
accountRoutes.get('/export', auth, h(async (req, res) => {
  const id = req.user.id;
  const one = async (sql, params = [id]) => (await q(sql, params)).rows;

  const data = {
    exportadoEm: new Date().toISOString(),
    perfil: (await one('SELECT id, handle, email, name, bio, palette, stars, created_at FROM users WHERE id = $1'))[0],
    comunidades: await one(
      `SELECT c.slug, c.name, m.role, m.joined_at FROM memberships m
       JOIN communities c ON c.id = m.community_id WHERE m.user_id = $1`),
    publicacoes: await one(
      `SELECT p.id, p.body, p.media_url, p.created_at, c.slug AS comunidade
       FROM posts p JOIN communities c ON c.id = p.community_id WHERE p.author_id = $1`),
    comentarios: await one('SELECT id, post_id, body, created_at FROM comments WHERE author_id = $1'),
    reacoes: await one('SELECT post_id, kind, created_at FROM reactions WHERE user_id = $1'),
    convitesPropostos: await one('SELECT id, text, vote_count, created_at FROM proposals WHERE author_id = $1'),
    votos: await one('SELECT proposal_id, created_at FROM proposal_votes WHERE user_id = $1'),
    aSeguir: await one(
      `SELECT u.handle FROM follows f JOIN users u ON u.id = f.following_id WHERE f.follower_id = $1`),
    seguidores: await one(
      `SELECT u.handle FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.following_id = $1`),
    // Mensagens efémeras já apagadas saem como registo, sem conteúdo: é isso que resta.
    mensagens: await one(
      `SELECT id, thread_id, kind, mode, body, created_at, purged_at
       FROM messages WHERE sender_id = $1`),
    diasRespondidos: await one('SELECT community_id, local_date FROM answer_days WHERE user_id = $1'),
  };

  res.setHeader('content-disposition', `attachment; filename="lumina-${req.user.handle}.json"`);
  res.json(data);
}));

/**
 * RGPD, artigo 17: apagar a conta.
 *
 * Com 30 dias de arrependimento. Quem apaga por impulso costuma voltar, e um
 * apagamento imediato é irreversível — nesse caso o erro é definitivo.
 */
accountRoutes.post('/delete', auth, h(async (req, res) => {
  const { rows } = await q(
    `INSERT INTO deletion_requests (user_id, execute_at)
     VALUES ($1, now() + interval '30 days')
     ON CONFLICT (user_id) DO UPDATE SET requested_at = now(),
       execute_at = now() + interval '30 days', cancelled_at = NULL
     RETURNING execute_at`,
    [req.user.id]
  );
  res.json({
    scheduled: true,
    executeAt: rows[0].execute_at,
    message: 'A conta será apagada dentro de 30 dias. Entra outra vez até lá para cancelar.',
  });
}));

accountRoutes.post('/delete/cancel', auth, h(async (req, res) => {
  const { rowCount } = await q(
    'UPDATE deletion_requests SET cancelled_at = now() WHERE user_id = $1 AND cancelled_at IS NULL',
    [req.user.id]
  );
  if (!rowCount) throw notFound('Não havia pedido de apagamento');
  res.json({ cancelled: true });
}));

/** O registo de dias respondidos, para a abertura. */
accountRoutes.get('/days', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT local_date FROM answer_days
     WHERE user_id = $1 AND local_date > current_date - 28
     ORDER BY local_date`,
    [req.user.id]
  );
  const set = new Set(rows.map(r => r.local_date.toISOString().slice(0, 10)));
  const days = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, answered: set.has(key) });
  }
  // Contagem vitalícia, sem janela — para marcos como "30 dias respondidos".
  // Continua sem streak que reseta: um marco só soma, nunca tira nada a ninguém.
  const { rows: lifetimeRows } = await q(
    `SELECT count(DISTINCT local_date)::int AS n FROM answer_days WHERE user_id = $1`,
    [req.user.id]
  );
  res.json({ days, total: set.size, lifetime: lifetimeRows[0].n });
}));
