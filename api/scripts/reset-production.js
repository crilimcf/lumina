import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../src/env.js';
import { migrate, pool, q, tx } from '../src/db.js';
import { signedUploadUrl } from '../src/lib/storage.js';

export const REQUIRED_CONFIRMATION = 'RESET_LUMINA_PRODUCTION';
// Fora da sequência normal das migrations. Fica em schema_migrations para o
// reset ser atómico e impossível de repetir num restart da mesma release.
export const RESET_MARKER_VERSION = 900009;

const quoteIdent = (value) => `"${String(value).replaceAll('"', '""')}"`;

async function removeTrackedObject(key) {
  if (!env.S3_BUCKET) return;
  const url = await signedUploadUrl(key, 'application/octet-stream', 300, 'DELETE');
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Falhou apagar media ${key}: HTTP ${response.status}`);
  }
}

export async function resetProduction({ confirmation = process.env.LUMINA_RESET_CONFIRM } = {}) {
  if (confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Reset recusado. Define LUMINA_RESET_CONFIRM=${REQUIRED_CONFIRMATION} apenas para a release de limpeza.`
    );
  }

  await migrate();

  const marker = await q(
    'SELECT 1 FROM schema_migrations WHERE version = $1',
    [RESET_MARKER_VERSION]
  );
  if (marker.rowCount) {
    console.log('[reset] limpeza final já foi executada; nada a fazer');
    return { alreadyDone: true };
  }

  const [{ rows: uploads }, { rows: tables }, { rows: summary }] = await Promise.all([
    q('SELECT key FROM uploads WHERE key IS NOT NULL ORDER BY created_at ASC'),
    q(`SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
       ORDER BY tablename`),
    q(`SELECT
         (SELECT count(*) FROM users)::int AS users,
         (SELECT count(*) FROM posts)::int AS posts,
         (SELECT count(*) FROM moments)::int AS moments,
         (SELECT count(*) FROM rooms)::int AS rooms,
         (SELECT count(*) FROM uploads)::int AS uploads`),
  ]);

  console.log('[reset] estado antes da limpeza:', summary[0]);
  console.log(`[reset] media rastreado a apagar: ${uploads.length}`);

  // O storage é limpo primeiro. Se qualquer DELETE falhar, a base de dados
  // permanece intacta para podermos repetir sem criar media órfão.
  for (const { key } of uploads) {
    await removeTrackedObject(key);
  }

  const dataTables = tables.map(({ tablename }) => quoteIdent(tablename));
  await tx(async (client) => {
    if (dataTables.length) {
      await client.query(`TRUNCATE ${dataTables.join(', ')} RESTART IDENTITY CASCADE`);
    }
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
      [RESET_MARKER_VERSION]
    );
  });

  const { rows: after } = await q(`SELECT
    (SELECT count(*) FROM users)::int AS users,
    (SELECT count(*) FROM posts)::int AS posts,
    (SELECT count(*) FROM moments)::int AS moments,
    (SELECT count(*) FROM rooms)::int AS rooms,
    (SELECT count(*) FROM uploads)::int AS uploads`);

  console.log('[reset] concluído:', after[0]);
  if (Object.values(after[0]).some(Number)) {
    throw new Error('Reset terminou com dados sociais residuais; intervenção necessária');
  }

  return { alreadyDone: false, before: summary[0], after: after[0] };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  resetProduction()
    .catch((error) => {
      console.error('[reset] FALHOU:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end().catch(() => {});
    });
}
