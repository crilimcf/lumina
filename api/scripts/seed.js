import bcrypt from 'bcryptjs';
import { q, tx, pool } from '../src/db.js';

const PEOPLE = [
  ['sofia', 'Sofia Marques', 'Luz natural, sempre. Faro → Lisboa.', 0, ['nascer do sol', 'analógico', '35 mm']],
  ['joao', 'João Antunes', 'Interfaces e tipografia. Estudo o branco.', 1, ['grelhas', 'suíça', 'risografia']],
  ['ana', 'Ana Ferraz', 'A viajar devagar. Escrevo o que vejo.', 4, ['comboios', 'ilhas', 'diários']],
  ['nuno', 'Nuno Vieira', 'Construo coisas pequenas que funcionam.', 2, ['madeira', 'reparar']],
];

const COMMUNITIES = [
  ['fotografia', 'Fotografia', 'Europe/Lisbon', 'sofia', [
    'Algo azul', 'A primeira coisa que viste hoje', 'Uma sombra que te fez parar',
    'O céu, sem cortar nada', 'A janela mais próxima de ti']],
  ['desenho', 'Desenho', 'Europe/Lisbon', 'joao', [
    'Uma grelha que não resultou', 'O teu tipo de letra preferido, em papel',
    'Um erro que ficou melhor que o plano', 'O que tens no caderno agora',
    'A cor que usas demasiado']],
  ['oficina', 'Oficina', 'Europe/Lisbon', 'nuno', [
    'A ferramenta mais usada da bancada', 'Uma coisa que arranjaste em vez de deitar fora',
    'O que estás a meio de fazer', 'O teu maior falhanço em madeira',
    'A bancada como está agora, sem arrumar']],
];

async function main() {
  console.log('A limpar…');
  await q('TRUNCATE users, communities, memberships, posts, proposals, invites, threads, messages, reports RESTART IDENTITY CASCADE');

  const hash = await bcrypt.hash('lumina1234', 12);
  const ids = {};

  for (const [handle, name, bio, palette, stars] of PEOPLE) {
    const { rows } = await q(
      `INSERT INTO users (handle, email, password_hash, name, bio, palette, stars,
                          birth_date, terms_accepted_at, terms_version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '1994-05-12', now(), '2026-08-01',
               now() - interval '30 days') RETURNING id`,
      [handle, `${handle}@exemplo.pt`, hash, name, bio, palette, stars]
    );
    ids[handle] = rows[0].id;
  }
  console.log(`${PEOPLE.length} pessoas · password: lumina1234`);

  for (const [slug, name, tz, founder, seeds] of COMMUNITIES) {
    await tx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO communities (slug, name, timezone, founder_id, member_count)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [slug, name, tz, ids[founder], PEOPLE.length]
      );
      const cid = rows[0].id;

      for (const [handle] of PEOPLE) {
        await c.query(
          `INSERT INTO memberships (community_id, user_id, role) VALUES ($1, $2, $3)`,
          [cid, ids[handle], handle === founder ? 'founder' : 'member']
        );
      }
      for (const [i, text] of seeds.entries()) {
        await c.query(
          `INSERT INTO proposals (community_id, author_id, text, is_seed, vote_count)
           VALUES ($1, $2, $3, true, $4)`,
          [cid, ids[founder], text, Math.max(0, 20 - i * 4)]
        );
      }
    });
  }
  console.log(`${COMMUNITIES.length} comunidades com propostas de arranque`);

  const { rotateInvites } = await import('../src/jobs/daily.js');
  const n = await rotateInvites();
  console.log(`${n} convites abertos para hoje`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
