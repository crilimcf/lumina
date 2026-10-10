/**
 * Avoid hammering broken publisher endpoints every 15 minutes.
 *
 * Retried sources remain active and recover automatically when they start
 * responding again. Manually requested syncs always bypass the cooldown.
 * Persisted last_fetch_error/last_fetched_at make this safe across restarts.
 */
export function radarRetryDelayMs(error) {
  const message = String(error || '').toLowerCase();
  if (/\bhttp (?:401|403|404|410)\b/.test(message)) return 12 * 60 * 60_000;
  if (/dtd\/entidades|xml com dtd|doctype|entidades não permitido/i.test(message)) return 6 * 60 * 60_000;
  if (/\bhttp 429\b/.test(message)) return 60 * 60_000;
  if (/\bhttp 5\d\d\b|timeout|dns|ligação|conexão|connection/i.test(message)) return 30 * 60_000;
  return 15 * 60_000;
}

export function isRadarSourceCoolingDown(source, now = Date.now()) {
  if (!source?.last_fetch_error || !source.last_fetched_at) return false;
  const lastAttempt = Date.parse(source.last_fetched_at);
  if (!Number.isFinite(lastAttempt) || !Number.isFinite(now)) return false;
  const elapsed = now - lastAttempt;
  return elapsed >= 0 && elapsed < radarRetryDelayMs(source.last_fetch_error);
}


/* One controlled recovery try after shipping an approved replacement URL.
 * Existing 403/401 permissions and generic publisher backoff always remain
 * in force. The attempt is process-local and never changes stored source config.
 */
export function mayRetryAfterVerifiedFeedReplacement(source, attempted = new Set()) {
  if (!source?.id || attempted.has(String(source.id))) return false;
  const url = String(source.url || '');
  const error = String(source.last_fetch_error || '');
  return (
    url === 'https://rss.dw.com/syndication/feeds/VAS_CB_Eng_OurVoice.31791-cb.html'
      && /dtd\/entidades|xml com dtd|doctype|entidades não permitido/i.test(error)
  ) || (
    url === 'https://www.rfi.fr/fr/rss'
      && /\bhttp (404|410)\b/i.test(error)
  );
}
