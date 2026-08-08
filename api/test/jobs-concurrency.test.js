import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, pool, q } from '../src/db.js';
import { rotateInvites } from '../src/jobs/daily.js';

before(async () => {
  await migrate();
  const { rows } = await q(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`
  );
  if (rows.length) {
    const tables = rows
      .map(({ tablename }) => `"${String(tablename).replaceAll('"', '""')}"`)
      .join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
});

after(async () => {
  await pool.end();
});

test('duas rotações concorrentes criam um convite e consomem só uma proposta', async () => {
  const { rows: users } = await q(
    `INSERT INTO users (handle, email, password_hash, name)
     VALUES ('rotate.founder', 'rotate-founder@example.test', 'irrelevante', 'Rotate Founder')
     RETURNING id`
  );
  const userId = users[0].id;

  const { rows: communities } = await q(
    `INSERT INTO communities (slug, name, timezone, founder_id, member_count)
     VALUES ('rotate-concurrency', 'Rotate Concurrency', 'Europe/Lisbon', $1, 1)
     RETURNING id`,
    [userId]
  );
  const communityId = communities[0].id;
  await q(
    `INSERT INTO memberships (community_id, user_id, role)
     VALUES ($1, $2, 'founder')`,
    [communityId, userId]
  );

  for (let i = 1; i <= 5; i++) {
    await q(
      `INSERT INTO proposals (community_id, author_id, text, is_seed, vote_count)
       VALUES ($1, $2, $3, true, 0)`,
      [communityId, userId, `seed concorrente ${i}`]
    );
  }

  const results = await Promise.all([rotateInvites(), rotateInvites()]);
  assert.equal(results[0] + results[1], 1);

  const invites = await q('SELECT count(*)::int AS n FROM invites WHERE community_id = $1', [communityId]);
  assert.equal(invites.rows[0].n, 1);

  const used = await q(
    'SELECT count(*)::int AS n FROM proposals WHERE community_id = $1 AND used_at IS NOT NULL',
    [communityId]
  );
  assert.equal(used.rows[0].n, 1);

  const remaining = await q(
    'SELECT count(*)::int AS n FROM proposals WHERE community_id = $1 AND used_at IS NULL',
    [communityId]
  );
  assert.equal(remaining.rows[0].n, 4);
});
