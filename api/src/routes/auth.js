import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { env } from '../env.js';
import { signToken, h, bad, HttpError, auth, audit, setSessionCookie, clearSessionCookie, csrfOf, recordSession } from '../middleware/auth.js';
import { verifyTotp, hashCode } from '../lib/totp.js';

export const authRoutes = Router();

const PUBLIC = 'id, handle, name, bio, palette, avatar_url, stars, created_at, session_version';

/**
 * Hash fixo para comparar quando o email nao existe. Sem isto, o login so
 * chama bcrypt quando ha conta — e bcrypt demora dezenas de milissegundos,
 * o que da para distinguir "existe" de "nao existe" so pela demora da resposta.
 */
const DUMMY_HASH = bcrypt.hashSync('lumina-nao-existe-conta-nenhuma', 12);

/**
 * Bloqueio progressivo por conta.
 *
 * O limite por janela de tempo nao chega: um atacante paciente passa por baixo
 * e um atacante com muitos IPs contorna-o de todo. Isto conta as falhas da
 * propria conta e vai esperando cada vez mais.
 */
async function checkLockout(email) {
  const { rows } = await q(
    `SELECT count(*)::int AS fails, max(created_at) AS last
     FROM login_attempts
     WHERE email = $1 AND success = false AND created_at > now() - interval '1 hour'`,
    [email]
  );
  const { fails, last } = rows[0];
  if (fails < 5) return;
  // 5 falhas: 1 min. 6: 2 min. 7: 4 min... ate 30 min.
  const waitMs = Math.min(2 ** (fails - 5) * 60_000, 30 * 60_000);
  const since = Date.now() - new Date(last).getTime();
  if (since < waitMs) {
    const secs = Math.ceil((waitMs - since) / 1000);
    throw new HttpError(429,
      `Demasiadas tentativas. Espera ${secs > 60 ? Math.ceil(secs / 60) + ' minutos' : secs + ' segundos'}.`,
      'locked_out');
  }
}

const recordAttempt = (email, ip, success) =>
  q('INSERT INTO login_attempts (email, ip, success) VALUES ($1, $2, $3)',
    [email, ip, success]).catch(() => {});

const TERMS_VERSION = '2026-08-01';

/** Idade em anos completos. */
function ageFrom(birthDate) {
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

authRoutes.post('/register', h(async (req, res) => {
  const { handle, email, password, name, birthDate, acceptTerms } = req.body;
  if (!handle || !email || !password || !name) throw bad('Faltam campos');
  if (String(password).length < 8) throw bad('A password precisa de 8 caracteres ou mais');
  if (!/^[a-z0-9._]{3,24}$/.test(handle)) throw bad('Nome de utilizador invalido: minusculas, numeros, ponto ou underscore');
  if (String(name).trim().length < 2 || String(name).length > 60) throw bad('Nome invalido');

  // O RGPD fixa a idade de consentimento em 16 anos; Portugal manteve os 16.
  // Uma rede social sem verificacao nenhuma nao e defensavel.
  if (!birthDate) throw bad('Falta a data de nascimento', 'birth_required');
  const age = ageFrom(birthDate);
  if (age === null) throw bad('Data de nascimento invalida');
  if (age < env.MIN_AGE) throw bad(`Tens de ter pelo menos ${env.MIN_AGE} anos`, 'too_young');
  if (age > 120) throw bad('Data de nascimento invalida');

  if (!acceptTerms) throw bad('Tens de aceitar os termos e a politica de privacidade', 'terms_required');

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await q(
    `INSERT INTO users (handle, email, password_hash, name, birth_date, terms_accepted_at, terms_version)
     VALUES ($1, $2, $3, $4, $5, now(), $6) RETURNING ${PUBLIC}`,
    [handle, email, hash, String(name).trim(), birthDate, TERMS_VERSION]
  );
  const token = signToken(rows[0]);
  // Um registo já é uma sessão real. Registamo-la antes de responder para que
  // o ecrã Segurança mostre imediatamente o dispositivo atual, tal como no login.
  await recordSession(rows[0].id, token, req);
  setSessionCookie(res, token);
  res.status(201).json({ token, csrf: csrfOf(token), user: rows[0] });
}));

authRoutes.post('/login', h(async (req, res) => {
  const { email, password, code } = req.body;
  if (!email || !password) throw bad('Faltam campos');

  await checkLockout(email);

  const { rows } = await q(
    `SELECT ${PUBLIC}, password_hash, suspended_at, totp_secret, totp_enabled_at
     FROM users WHERE email = $1`,
    [email]
  );
  const user = rows[0];
  // Mesma resposta para email errado e password errada: nao revelamos quem tem conta.
  // bcrypt.compare corre sempre, exista ou nao a conta, para a resposta nao
  // demorar de forma diferente consoante o email exista.
  const passwordMatches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  const ok = user && passwordMatches;
  if (!ok) {
    await recordAttempt(email, req.ip, false);
    throw new HttpError(401, 'Email ou password errados');
  }
  if (user.suspended_at) throw new HttpError(403, 'Conta suspensa');

  // Dois passos: password certa nao chega.
  if (user.totp_enabled_at) {
    if (!code) {
      // Nao gravamos como falha: a password estava certa.
      return res.status(200).json({ needsCode: true });
    }
    let valid = verifyTotp(user.totp_secret, code);
    if (!valid) {
      // Pode ser um codigo de emergencia, que so serve uma vez.
      const { rowCount } = await q(
        `UPDATE recovery_codes SET used_at = now()
         WHERE code_hash = $1 AND user_id = $2 AND used_at IS NULL`,
        [hashCode(String(code)), user.id]
      );
      valid = rowCount > 0;
      if (valid) audit(user.id, '2fa:codigo-emergencia-usado', user.id);
    }
    if (!valid) {
      await recordAttempt(email, req.ip, false);
      throw new HttpError(401, 'Codigo errado', 'bad_code');
    }
  }

  await recordAttempt(email, req.ip, true);
  delete user.password_hash;
  delete user.suspended_at;
  delete user.totp_secret;
  const twoFactor = !!user.totp_enabled_at;
  delete user.totp_enabled_at;
  user.two_factor = twoFactor;

  // Entrar cancela um apagamento pendente: e o arrependimento em acao.
  await q('UPDATE deletion_requests SET cancelled_at = now() WHERE user_id = $1 AND cancelled_at IS NULL',
    [user.id]).catch(() => {});

  const token = signToken(user);
  recordSession(user.id, token, req);
  setSessionCookie(res, token);
  res.json({ token, csrf: csrfOf(token), user });
}));

/** Fecha a sessao do lado do browser: apaga o cookie HttpOnly. */
authRoutes.post('/logout', h(async (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
}));

authRoutes.get('/me', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT ${PUBLIC},
       (SELECT count(*) FROM follows WHERE following_id = u.id)::int AS followers,
       (SELECT count(*) FROM follows WHERE follower_id = u.id)::int AS following,
       (SELECT execute_at FROM deletion_requests d
        WHERE d.user_id = u.id AND d.cancelled_at IS NULL) AS deletion_scheduled_for
     FROM users u WHERE id = $1`,
    [req.user.id]
  );
  // Também aqui: depois de um reload, é a única maneira de o frontend
  // recuperar o valor CSRF (não vive em cookie legível, vive em memória).
  res.json({ ...rows[0], csrf: req.sessionCsrf });
}));

/**
 * RGPD artigo 16: direito de retificacao.
 * Sem isto, a pessoa nao consegue corrigir dados errados sobre si propria.
 */
authRoutes.patch('/me', auth, h(async (req, res) => {
  const { name, bio, palette, stars, avatarUrl } = req.body;
  const sets = [];
  const vals = [req.user.id];

  if (name !== undefined) {
    if (String(name).trim().length < 2 || String(name).length > 60) throw bad('Nome invalido');
    sets.push(`name = $${vals.push(String(name).trim())}`);
  }
  if (bio !== undefined) {
    if (String(bio).length > 300) throw bad('A descricao tem no maximo 300 caracteres');
    sets.push(`bio = $${vals.push(String(bio))}`);
  }
  if (palette !== undefined) {
    const p = Number(palette);
    if (!Number.isInteger(p) || p < 0 || p > 4) throw bad('Cor invalida');
    sets.push(`palette = $${vals.push(p)}`);
  }
  if (stars !== undefined) {
    if (!Array.isArray(stars) || stars.length > 8) throw bad('No maximo 8 estrelas');
    const clean = stars.map(s => String(s).trim().slice(0, 24)).filter(Boolean);
    sets.push(`stars = $${vals.push(clean)}`);
  }
  if (avatarUrl !== undefined) {
    if (avatarUrl === null || avatarUrl === '') {
      sets.push(`avatar_url = $${vals.push(null)}`);
    } else {
      // Tem de ser tua e ter passado a verificacao de assinatura — sem
      // isto, bastava apontar avatarUrl para qualquer coisa na internet.
      const { rows: up } = await q(
        'SELECT 1 FROM uploads WHERE url = $1 AND owner_id = $2 AND confirmed_at IS NOT NULL',
        [avatarUrl, req.user.id]
      );
      if (!up[0]) throw bad('Imagem nao verificada', 'unconfirmed_upload');
      sets.push(`avatar_url = $${vals.push(avatarUrl)}`);
    }
  }
  if (!sets.length) throw bad('Nada para alterar');

  const { rows } = await q(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING ${PUBLIC}`, vals
  );
  res.json(rows[0]);
}));

/** Mudar a password estando dentro. Fecha as outras sessoes. */
authRoutes.post('/change-password', auth, h(async (req, res) => {
  const { current, password } = req.body;
  if (!current || !password) throw bad('Faltam campos');
  if (String(password).length < 8) throw bad('A password precisa de 8 caracteres ou mais');

  const { rows } = await q('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!await bcrypt.compare(current, rows[0].password_hash)) throw bad('Password atual errada');

  const { rows: up } = await q(
    `UPDATE users SET password_hash = $2, session_version = session_version + 1
     WHERE id = $1 RETURNING ${PUBLIC}`,
    [req.user.id, await bcrypt.hash(password, 12)]
  );
  // Devolve um token novo para quem mudou nao ficar de fora. Sem registar
  // esta sessao, a lista em "Seguranca" ficava sem o dispositivo atual e
  // continuava a mostrar os outros como ativos (ja tinham sido invalidados
  // pela subida de session_version, so a tabela sessions nao sabia disso).
  const token = signToken(up[0]);
  recordSession(up[0].id, token, req);
  setSessionCookie(res, token);
  res.json({ token, csrf: csrfOf(token), user: up[0] });
}));
