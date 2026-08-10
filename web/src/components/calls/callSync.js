const BASE = import.meta.env.VITE_API_URL || '/api';

async function getJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      credentials: 'include',
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Falha na chamada');
    return data;
  } finally { clearTimeout(timer); }
}

export function syncCall(callId, after = 0) {
  return getJson(`${BASE}/calls/${encodeURIComponent(callId)}/sync?after=${encodeURIComponent(after)}`);
}

export function fetchIceConfig() {
  return getJson(`${BASE}/calls/ice-config`, 6000);
}
