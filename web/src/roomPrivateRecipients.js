import { isNativeApp, nativeApiOrigin, nativeAuthHeaders } from './native/session.js';

const BASE = isNativeApp ? nativeApiOrigin : (import.meta.env.VITE_API_URL || '/api');

export async function roomPrivateRecipients(roomId, query) {
  const res = await fetch(`${BASE}/rooms/${encodeURIComponent(roomId)}/private-recipients?q=${encodeURIComponent(query)}`, {
    credentials: 'include',
    headers: nativeAuthHeaders(),
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error(data?.error || 'Não foi possível procurar membros da sala');
  return Array.isArray(data) ? data : [];
}
