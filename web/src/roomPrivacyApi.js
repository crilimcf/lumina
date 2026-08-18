import { isNativeApp, nativeApiOrigin, nativeAuthHeaders } from './native/session.js';

const BASE = isNativeApp ? nativeApiOrigin : (import.meta.env.VITE_API_URL || '/api');

export async function roomPrivateRecipients(roomId, query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const response = await fetch(`${BASE}/rooms/${encodeURIComponent(roomId)}/private-recipients?q=${encodeURIComponent(q)}`, {
    credentials:'include',
    headers:{ ...nativeAuthHeaders() },
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data?.error || 'Não foi possível procurar pessoas nesta sala');
  return Array.isArray(data) ? data : [];
}
