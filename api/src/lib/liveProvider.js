import { env } from '../env.js';

const endpoint = () => `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_STREAM_ACCOUNT_ID)}/stream/live_inputs`;

export const liveProviderConfigured = () => Boolean(env.CF_STREAM_ACCOUNT_ID && env.CF_STREAM_API_TOKEN);

async function cf(path = '', options = {}) {
  const response = await fetch(`${endpoint()}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${env.CF_STREAM_API_TOKEN}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const detail = payload?.errors?.[0]?.message || `Cloudflare Stream ${response.status}`;
    throw new Error(detail);
  }
  return payload.result;
}

export async function createLiveInput({ liveId, creatorId, title }) {
  if (!liveProviderConfigured()) {
    if (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') {
      return {
        configured: false,
        inputId: `local-${liveId}`,
        publishUrl: null,
        playbackUrl: null,
      };
    }
    throw new Error('Cloudflare Stream não configurado');
  }

  const result = await cf('', {
    method: 'POST',
    body: JSON.stringify({
      meta: {
        name: `Lumina Live · ${String(title).slice(0, 80)}`,
        liveId: String(liveId),
        creatorId: String(creatorId),
      },
      recording: { mode: 'off' },
    }),
  });

  const publishUrl = result?.webRTC?.url || null;
  const playbackUrl = result?.webRTCPlayback?.url || null;
  if (!result?.uid || !publishUrl || !playbackUrl) {
    throw new Error('Cloudflare Stream não devolveu endpoints WebRTC válidos');
  }

  return {
    configured: true,
    inputId: result.uid,
    publishUrl,
    playbackUrl,
  };
}

export async function deleteLiveInput(inputId) {
  if (!inputId || String(inputId).startsWith('local-') || !liveProviderConfigured()) return;
  await cf(`/${encodeURIComponent(inputId)}`, { method: 'DELETE' });
}
