/** Scrub untrusted browser diagnostics before network transport. */
export function redactDiagnostic(value, maxLength = 800) {
  return String(value ?? '')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{15,})\b/g, '[redacted-token]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[redacted-email]')
    .replace(/https?:\/\/[^\s)]+/gi, value => {
      try { const url = new URL(value); return url.origin + url.pathname; }
      catch { return '[redacted-url]'; }
    })
    .slice(0, Math.max(0, Math.min(8000, maxLength)));
}
