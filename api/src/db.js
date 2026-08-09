import pg from 'pg';
import { env } from './env.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Railway, Render e Supabase servem Postgres com certificado próprio.
  ssl: env.PGSSL ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => console.error('[pg] erro no pool:', err.message));

export const q = (text, params) => pool.query(text, params);

/** Corre uma função dentro de uma transação. Faz rollback se rebentar. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listMigrationFiles() {
  const { readdir } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const dir = fileURLToPath(new URL('../migrations', import.meta.url));
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  return { dir, files };
}

/**
 * Devolve a migration mais recente que existe neste build e está registada na BD.
 * Registos históricos/sentinela que não correspondam a ficheiros reais são ignorados.
 */
export async function getAppliedSchemaVersion() {
  const { files } = await listMigrationFiles();
  const versions = files
    .map(file => Number(file.split('_')[0]))
    .filter(Number.isInteger);

  if (!versions.length) return 0;

  const { rows } = await q(
    `SELECT COALESCE(MAX(version), 0)::int AS schema_version
       FROM schema_migrations
      WHERE version = ANY($1::int[])`,
    [versions],
  );
  return rows[0]?.schema_version ?? 0;
}

/**
 * Aplica as migrações por ordem e regista quais já correram.
 * Corre no arranque, por isso um deploy novo migra-se a si próprio.
 */
export async function migrate() {
  const { readFile } = await import('node:fs/promises');
  const { dir, files } = await listMigrationFiles();

  await q(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  const { rows } = await q('SELECT version FROM schema_migrations');
  const done = new Set(rows.map(r => r.version));

  for (const file of files) {
    const version = Number(file.split('_')[0]);
    if (done.has(version)) continue;
    console.log(`[migracao] a aplicar ${file}`);
    await tx(async (c) => {
      await c.query(await readFile(`${dir}/${file}`, 'utf8'));
      await c.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [version]);
    });
  }
  console.log('[migracao] base de dados em dia');
}
