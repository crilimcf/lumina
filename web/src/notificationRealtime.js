const STREAM_URL = '/api/notifications/events';
const SESSION_URL = '/api/auth/me';
const RETRY_VISIBLE_MS = 5_000;
const RETRY_HIDDEN_MS = 30_000;

let source = null;
let retryTimer = null;
let connecting = false;

const schedule = () => {
  if (retryTimer || source || connecting) return;
  const delay = document.visibilityState === 'visible' ? RETRY_VISIBLE_MS : RETRY_HIDDEN_MS;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect().catch(() => schedule());
  }, delay);
};

const hasSession = async () => {
  try {
    const response = await fetch(SESSION_URL, {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    return response.ok;
  } catch {
    return false;
  }
};

const closeSource = () => {
  source?.close();
  source = null;
};

async function connect() {
  if (source || connecting || !('EventSource' in window)) return;
  connecting = true;
  try {
    if (!await hasSession()) return schedule();

    const stream = new EventSource(STREAM_URL, { withCredentials: true });
    source = stream;

    stream.onmessage = event => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (payload.type !== 'notification_changed') return;
        window.dispatchEvent(new CustomEvent('lumina:notification-realtime', { detail: payload }));
        window.dispatchEvent(new CustomEvent('lumina:notifications-changed', { detail: payload }));
      } catch {
        // Um frame inválido nunca deve afetar a aplicação.
      }
    };

    stream.onerror = () => {
      closeSource();
      schedule();
    };
  } finally {
    connecting = false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    connect().catch(() => schedule());
  }
});

window.addEventListener('pageshow', () => connect().catch(() => schedule()));
window.addEventListener('offline', closeSource);
window.addEventListener('online', () => connect().catch(() => schedule()));

setTimeout(() => connect().catch(() => schedule()), 700);
