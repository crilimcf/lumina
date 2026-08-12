const REGION_KEY = 'lumina-one-confirmed-region-v3';
const nativeFetch = window.fetch.bind(window);
let csrfToken = '';
let csrfFetchedAt = 0;
let csrfFlight = null;

function isTogetherMutation(input, init = {}) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
  if (!raw) return false;
  const url = new URL(raw, window.location.origin);
  const method = String(init.method || input?.method || 'GET').toUpperCase();
  return url.origin === window.location.origin
    && url.pathname.startsWith('/api/one/together')
    && !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

async function loadCsrf(force = false) {
  if (!force && csrfToken && Date.now() - csrfFetchedAt < 10 * 60_000) return csrfToken;
  if (!force && csrfFlight) return csrfFlight;
  csrfFlight = nativeFetch('/api/auth/me', {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  }).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.csrf) throw new Error(body?.error || 'Sessão inválida');
    csrfToken = String(body.csrf);
    csrfFetchedAt = Date.now();
    return csrfToken;
  }).finally(() => { csrfFlight = null; });
  return csrfFlight;
}

function withCsrfHeaders(input, init, token) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers || {}).forEach((value, key) => headers.set(key, value));
  headers.set('x-csrf-token', token);
  return headers;
}

window.fetch = async function luminaFetch(input, init = {}) {
  if (!isTogetherMutation(input, init)) return nativeFetch(input, init);

  const send = async (forceRefresh = false) => {
    const token = await loadCsrf(forceRefresh);
    const headers = withCsrfHeaders(input, init, token);
    if (input instanceof Request) {
      return nativeFetch(new Request(input, { ...init, headers }));
    }
    return nativeFetch(input, { ...init, headers });
  };

  let response = await send(false);
  if (response.status === 403) response = await send(true);
  return response;
};

function setReactInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) {
    const previous = input.value;
    setter.call(input, value);
    if (input._valueTracker) input._valueTracker.setValue(previous);
  } else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function requestPosition(options) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation?.getCurrentPosition) {
      const error = new Error('Geolocalização indisponível');
      error.code = 0;
      reject(error);
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function refinePosition(seed, timeoutMs = 8000) {
  return new Promise(resolve => {
    if (!navigator.geolocation?.watchPosition) return resolve(seed);
    let best = seed || null;
    let watchId = null;
    let done = false;
    const score = position => Number(position?.coords?.accuracy || Infinity);
    const finish = () => {
      if (done) return;
      done = true;
      if (watchId !== null && navigator.geolocation?.clearWatch) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      resolve(best);
    };
    const timer = setTimeout(finish, timeoutMs);
    watchId = navigator.geolocation.watchPosition(position => {
      if (!best || score(position) < score(best)) best = position;
      if (score(best) <= 250) finish();
    }, () => finish(), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: timeoutMs,
    });
  });
}

async function acquireDevicePosition() {
  let first = null;
  let firstError = null;
  try {
    first = await requestPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 });
  } catch (error) {
    firstError = error;
    if (Number(error?.code) === 1) throw error;
  }

  if (!first) {
    try {
      first = await requestPosition({ enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 });
    } catch (error) {
      if (Number(error?.code) === 1) throw error;
      throw firstError || error;
    }
  }

  const refined = await refinePosition(first, 8000);
  const accuracy = Number(refined?.coords?.accuracy || Infinity);
  if (!Number.isFinite(accuracy) || accuracy > 15_000) {
    const error = new Error('Localização demasiado imprecisa');
    error.code = 4;
    error.accuracy = accuracy;
    throw error;
  }
  return refined;
}

async function reverseGeocode(latitude, longitude) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('zoom', '10');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'pt-PT,pt');
    const response = await nativeFetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`reverse_${response.status}`);
    const data = await response.json();
    const address = data?.address || {};
    const city = address.city || address.town || address.village || address.municipality || address.county || address.state;
    if (!city) throw new Error('reverse_no_city');
    return String(city).trim().slice(0, 80);
  } finally {
    clearTimeout(timer);
  }
}

function decorateLocation() {
  document.querySelectorAll('.one-v3-location').forEach(location => {
    if (location.dataset.deviceFix === '1') return;
    location.dataset.deviceFix = '1';
    const copy = location.querySelector('.one-v3-location-copy');
    const button = location.querySelector('.one-v3-location-button');
    if (copy) copy.innerHTML = '<span>LOCALIZAÇÃO</span><b>A tua cidade, confirmada pelo iPhone</b><small>Usamos a localização do sistema. Se estiver indisponível, mantemos a cidade escolhida por ti — nunca a trocamos por uma estimativa de Wi‑Fi/4G.</small>';
    if (button) button.textContent = 'Detetar onde estou';
  });
}

async function handleLocation(button) {
  const root = button.closest('.lumina-one');
  const settings = button.closest('.one-settings-card') || root?.querySelector('.one-settings-card');
  const input = settings?.querySelector('.one-region-input input');
  const status = settings?.querySelector('.one-v3-location-status');
  if (!input || !status) return;

  button.disabled = true;
  button.textContent = 'A pedir localização ao iPhone…';
  status.className = 'one-v3-location-status';
  status.textContent = 'A obter a posição do sistema. Não usamos a cidade aproximada da operadora como substituição.';

  try {
    const position = await acquireDevicePosition();
    const accuracy = Math.round(Number(position.coords.accuracy || 0));
    const city = await reverseGeocode(position.coords.latitude, position.coords.longitude);
    setReactInputValue(input, city);
    status.className = 'one-v3-location-status is-ok';
    status.textContent = `${city} detetada pela localização do iPhone${accuracy ? ` · precisão ~${accuracy} m` : ''}. Confirma em “Guardar e adaptar a Lumina”.`;
    input.focus({ preventScroll: true });
  } catch (error) {
    const preferred = input.value.trim() || localStorage.getItem(REGION_KEY) || '';
    status.className = 'one-v3-location-status is-warn';
    if (Number(error?.code) === 1) {
      status.textContent = preferred
        ? `O iPhone não deu acesso à localização nesta sessão. Mantive ${preferred}.`
        : 'O iPhone não deu acesso à localização nesta sessão. Podes escrever a tua cidade acima.';
    } else if (Number(error?.code) === 4) {
      status.textContent = preferred
        ? `A localização recebida estava demasiado imprecisa. Mantive ${preferred} para não indicar uma cidade errada.`
        : 'A localização recebida estava demasiado imprecisa. Escreve a tua cidade para evitar uma indicação errada.';
    } else {
      status.textContent = preferred
        ? `Não consegui obter a localização do iPhone. Mantive ${preferred}.`
        : 'Não consegui obter a localização do iPhone. Escreve a tua cidade acima e tenta novamente mais tarde.';
    }
  } finally {
    button.disabled = false;
    button.textContent = 'Tentar localização novamente';
  }
}

document.addEventListener('click', event => {
  const button = event.target?.closest?.('.one-v3-location-button');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  handleLocation(button);
}, true);

let scheduled = false;
function scheduleDecoration() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    decorateLocation();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleDecoration, { once: true });
else scheduleDecoration();
new MutationObserver(scheduleDecoration).observe(document.documentElement, { childList: true, subtree: true });
