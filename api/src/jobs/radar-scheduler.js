import cron from 'node-cron';
import { syncRadarSources } from './radar.js';
import { syncWebRadarSources } from './radar-web.js';

let running = false;

async function runRadarSync() {
  if (running) return;
  running = true;
  const started = Date.now();
  try {
    const [rss, web] = await Promise.all([
      syncRadarSources(),
      syncWebRadarSources(),
    ]);
    const attempted = (rss.attempted || 0) + (web.attempted || 0);
    const succeeded = (rss.succeeded || 0) + (web.succeeded || 0);
    const failed = (rss.failed || 0) + (web.failed || 0);
    const items = (rss.items || 0) + (web.items || 0);
    if (attempted || failed) {
      console.log(`[radar] sync: ${succeeded}/${attempted} fontes · ${items} itens · ${Date.now() - started} ms`);
    }
  } catch (error) {
    console.error('[radar] sync falhou:', error.message);
  } finally {
    running = false;
  }
}

export function startRadarJobs() {
  if (process.env.RUN_JOBS_IN_PROCESS === 'false' || process.env.RADAR_INGEST_ENABLED === 'false') {
    console.log('[radar] ingestão automática desligada neste processo');
    return;
  }
  cron.schedule('*/15 * * * *', runRadarSync);
  setTimeout(runRadarSync, 30_000).unref();
  console.log('[radar] ingestão RSS + fontes verificadas agendada de 15 em 15 minutos');
}
