import bcrypt from 'bcryptjs';
import { q, pool } from '../src/db.js';

const PEOPLE = [
  ['sofia', 'Sofia Marques', 'Luz natural, sempre. Faro → Lisboa.', 0, ['nascer do sol', 'analógico', '35 mm']],
  ['joao', 'João Antunes', 'Interfaces e tipografia. Estudo o branco.', 1, ['grelhas', 'suíça', 'risografia']],
  ['ana', 'Ana Ferraz', 'A viajar devagar. Escrevo o que vejo.', 4, ['comboios', 'ilhas', 'diários']],
  ['nuno', 'Nuno Vieira', 'Construo coisas pequenas que funcionam.', 2, ['madeira', 'reparar']],
];

async function main() {
  console.log('A limpar dados de demonstração…');
  const { rows } = await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`);
  if (rows.length) {
    const tables = rows.map(({ tablename }) => `"${String(tablename).replaceAll('"','""')}"`).join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }

  const hash = await bcrypt.hash('lumina1234', 12);
  const ids = {};
  for (const [handle, name, bio, palette, stars] of PEOPLE) {
    const { rows: inserted } = await q(
      `INSERT INTO users (handle, email, password_hash, name, bio, palette, stars,
                          birth_date, terms_accepted_at, terms_version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '1994-05-12', now(), '2026-08-01',
               now() - interval '30 days') RETURNING id`,
      [handle, `${handle}@exemplo.pt`, hash, name, bio, palette, stars]
    );
    ids[handle] = inserted[0].id;
  }

  for (const follower of PEOPLE) {
    for (const followed of PEOPLE) {
      if (follower[0] === followed[0]) continue;
      await q('INSERT INTO follows (follower_id,following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [ids[follower[0]], ids[followed[0]]]);
    }
  }

  await q(`INSERT INTO posts (author_id,body,palette) VALUES
    ($1,'Primeira luz da manhã. Sem filtro.',0),
    ($2,'A trabalhar numa interface que desaparece quando já não é necessária.',1),
    ($3,'Viagem lenta, janela aberta e um caderno.',4),
    ($4,'Hoje reparei uma peça em vez de a substituir.',2)`,
    [ids.sofia, ids.joao, ids.ana, ids.nuno]
  );

  console.log(`${PEOPLE.length} pessoas de demonstração · password: lumina1234`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
