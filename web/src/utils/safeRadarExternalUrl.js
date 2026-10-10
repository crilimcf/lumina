/** Return an absolute, externally navigable HTTP(S) URL or nothing.
 * Radar content is received from publishers and other people; HTML escaping
 * alone does not make a javascript: or data: href safe.
 */
export function safeRadarExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (!url.hostname || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}
