/**
 * One operational summary for RSS and publisher ingestion, including sources
 * that were intentionally skipped under cooldown. No source URLs or secrets.
 */
export function formatRadarSyncStatus(rss = {}, web = {}, elapsedMs = 0) {
  const attempted = (rss.attempted || 0) + (web.attempted || 0);
  const succeeded = (rss.succeeded || 0) + (web.succeeded || 0);
  const failed = (rss.failed || 0) + (web.failed || 0);
  const items = (rss.items || 0) + (web.items || 0);
  const cooldown = (rss.cooldown || 0) + (web.cooldown || 0);
  if (!attempted && !failed && !cooldown) return null;
  return `${succeeded}/${attempted} fontes consultadas · ${items} itens · ${cooldown} fontes em espera · ${failed} falhas · ${elapsedMs} ms`;
}
