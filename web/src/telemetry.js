const recent = new Map();
const DEDUPE_MS = 30_000;

const clip = (value, max) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : '';
};

const currentAsset = () => {
  const script = document.querySelector('script[type="module"][src*="/assets/"]');
  return clip(script?.getAttribute('src'), 500);
};

const release = () => clip(document.querySelector('meta[name="lumina-ui-release"]')?.content, 160);
const cleanPath = () => `${window.location.pathname}`.slice(0, 500);

const normalizeError = (value) => {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try { return new Error(JSON.stringify(value)); }
  catch { return new Error('Erro JavaScript sem detalhe'); }
};

export async function reportClientError(value, { kind = 'window_error', componentStack = '' } = {}) {
  const error = normalizeError(value);
  const message = clip(error.message || error.name || 'Erro JavaScript', 800);
  const stack = clip(error.stack, 8000);
  const key = `${message}|${stack.split('\n')[1] || ''}|${cleanPath()}`;
  const now = Date.now();
  if (now - (recent.get(key) || 0) < DEDUPE_MS) return false;
  recent.set(key, now);
  if (recent.size > 100) {
    for (const [fingerprint, timestamp] of recent) {
      if (now - timestamp > DEDUPE_MS) recent.delete(fingerprint);
    }
  }

  const payload = {
    kind,
    message,
    stack,
    componentStack: clip(componentStack, 6000),
    path: cleanPath(),
    release: release(),
    asset: currentAsset(),
    online: navigator.onLine,
  };

  try {
    const response = await fetch('/api/telemetry/errors', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch {
    // Telemetria nunca pode afetar a utilização da app.
    return false;
  }
}

let installed = false;
export function installGlobalErrorTelemetry() {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    if (!event?.error) return;
    reportClientError(event.error, { kind: 'window_error' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event?.reason, { kind: 'unhandled_rejection' });
  });
}
