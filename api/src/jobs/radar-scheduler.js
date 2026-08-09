import cron from 'node-cron';
import { syncRadarSources } from './radar.js';

let running = false;

async function runRadarSync() {
  if (running) return;
  running = true;
  const started = Date.now();
  try {
    const result = await syncRadarSources();
    if (result.skipped) return;
    if (result.attempted || result.failed) {
      console.log(`[radar] sync: ${result.succeeded}/${result.attempted} fontes · ${result.items} itens · ${Date.now() - started} ms`);
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
  console.log('[radar] ingestão RSS agendada de 15 em 15 minutos');
}
