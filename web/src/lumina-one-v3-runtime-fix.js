const REGION_KEY = 'lumina-one-confirmed-region-v3';
const nativeFetch = window.fetch.bind(window);
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

async function loadFreshCsrf() {
  if (csrfFlight) return csrfFlight;
  const url = new URL('/api/auth/me', window.location.origin);
  url.searchParams.set('__csrf_refresh', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  csrfFlight = nativeFetch(url.toString(), {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'cache-control': 'no-cache',
      Pragma: 'no-cache',
    },
  }).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.csrf) throw new Error(body?.error || 'Sessão inválida');
    return String(body.csrf);
  }).finally(() => { csrfFlight = null; });
  return csrfFlight;
}

function withCsrfHeaders(input, init, token) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers || {}).forEach((value, key) => headers.set(key, value));
  headers.set('x-csrf-token', token);
  headers.set('cache-control', 'no-cache');
  return headers;
}

async function sendTogetherMutation(input, init) {
  const token = await loadFreshCsrf();
  const headers = withCsrfHeaders(input, init, token);
  if (input instanceof Request) {
    return nativeFetch(new Request(input, {
      ...init,
      headers,
      credentials: init.credentials || input.credentials || 'include',
    }));
  }
  return nativeFetch(input, { ...init, headers, credentials: init.credentials || 'include' });
}

window.fetch = async function luminaFetch(input, init = {}) {
  if (!isTogetherMutation(input, init)) return nativeFetch(input, init);
  let response = await sendTogetherMutation(input, init);
  if (response.status !== 403) return response;
  const firstError = await response.clone().json().catch(() => ({}));
  if (firstError?.code && firstError.code !== 'csrf') return response;
  return sendTogetherMutation(input, init);
};

function setReactInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) {
    const previous = input.value;
    setter.call(input, value);
    if (input._valueTracker) input._valueTracker.setValue(previous);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function locationError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function requestPosition(options) {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) {
      reject(locationError(6, 'A página não está num contexto seguro'));
      return;
    }
    if (!navigator.geolocation?.getCurrentPosition) {
      reject(locationError(0, 'Geolocalização indisponível'));
      return;
    }

    // Deliberately call the real Geolocation API every time. Do not gate this
    // on navigator.permissions: Safari/iOS can expose a stale or site-specific
    // permission state and the native geolocation callback is the source of truth.
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function positionAccuracy(position) {
  return Number(position?.coords?.accuracy || Infinity);
}

function positionAge(position) {
  const stamp = Number(position?.timestamp || 0);
  return stamp > 0 ? Math.max(0, Date.now() - stamp) : Infinity;
}

function betterPosition(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const aAccuracy = positionAccuracy(a);
  const bAccuracy = positionAccuracy(b);
  if (Math.abs(aAccuracy - bAccuracy) > 250) return aAccuracy <= bAccuracy ? a : b;
  return positionAge(a) <= positionAge(b) ? a : b;
}

function refinePosition(seed, timeoutMs = 6000) {
  return new Promise(resolve => {
    if (!navigator.geolocation?.watchPosition) return resolve(seed);
    let best = seed || null;
    let watchId = null;
    let finished = false;
    let timer = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (watchId !== null && navigator.geolocation?.clearWatch) navigator.geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
      resolve(best);
    };

    timer = setTimeout(finish, timeoutMs);
    watchId = navigator.geolocation.watchPosition(position => {
      best = betterPosition(best, position);
      if (positionAccuracy(best) <= 900) finish();
    }, () => finish(), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: timeoutMs,
    });
  });
}

async function acquireDevicePosition() {
  let cached = null;
  let fresh = null;
  let firstError = null;

  try {
    cached = await requestPosition({
      enableHighAccuracy: false,
      maximumAge: 10 * 60_000,
      timeout: 4500,
    });
    if (positionAccuracy(cached) <= 1000) return cached;
  } catch (error) {
    firstError = error;
    if (Number(error?.code) === 1 || Number(error?.code) === 6) throw error;
  }

  try {
    fresh = await requestPosition({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15_000,
    });
  } catch (error) {
    if (Number(error?.code) === 1 || Number(error?.code) === 6) throw error;
    firstError ||= error;
  }

  let best = betterPosition(cached, fresh);
  if (!best) {
    try {
      best = await requestPosition({
        enableHighAccuracy: false,
        maximumAge: 10 * 60_000,
        timeout: 9000,
      });
    } catch (error) {
      if (Number(error?.code) === 1 || Number(error?.code) === 6) throw error;
      throw firstError || error;
    }
  }

  if (positionAccuracy(best) > 1000) best = await refinePosition(best, 6000);
  const accuracy = positionAccuracy(best);
  if (!Number.isFinite(accuracy) || accuracy > 30_000) {
    throw locationError(4, 'Localização demasiado imprecisa', { accuracy });
  }
  return best;
}

async function reverseGeocode(latitude, longitude) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('zoom', '10');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'pt-PT,pt');
    const response = await nativeFetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw locationError(5, `reverse_${response.status}`);
    const data = await response.json();
    const address = data?.address || {};
    const city = address.city || address.town || address.village || address.municipality || address.county || address.state;
    if (!city) throw locationError(5, 'reverse_no_city');
    return String(city).trim().slice(0, 80);
  } catch (error) {
    if (Number(error?.code) === 5) throw error;
    throw locationError(5, error?.name === 'AbortError' ? 'reverse_timeout' : 'reverse_failed');
  } finally {
    clearTimeout(timer);
  }
}

function normalizeRegion(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function regionsAgree(a, b) {
  const left = normalizeRegion(a);
  const right = normalizeRegion(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function decorateLocation() {
  document.querySelectorAll('.one-v3-location').forEach(location => {
    if (location.dataset.deviceFix === '3') return;
    location.dataset.deviceFix = '3';
    const copy = location.querySelector('.one-v3-location-copy');
    const button = location.querySelector('.one-v3-location-button');
    if (copy) {
      copy.innerHTML = '<span>LOCALIZAÇÃO</span><b>Detetar a tua cidade pelo iPhone</b><small>Pedimos a localização diretamente ao iPhone. Se o Safari a tiver bloqueado, mostramos exatamente onde a reativar. Uma leitura grosseira nunca substitui uma cidade que já confirmaste.</small>';
    }
    if (button) {
      button.textContent = 'Detetar onde estou';
      button.setAttribute('aria-label', 'Detetar localização do iPhone');
    }
  });
}

function deniedMessage(preferred) {
  const kept = preferred ? ` Mantive ${preferred}.` : '';
  return `O iPhone recusou o acesso à localização.${kept} No Safari, abre este site e toca no botão do Menu da Página junto à barra de endereço → Mais → Definições do site → Localização → Permitir. Depois volta à Lumina e toca novamente em “Tentar localização novamente”.`;
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
  status.textContent = 'A pedir a localização diretamente ao iPhone…';

  const preferred = input.value.trim() || localStorage.getItem(REGION_KEY) || '';

  try {
    const position = await acquireDevicePosition();
    const accuracy = Math.round(positionAccuracy(position));
    let city;

    try {
      city = await reverseGeocode(position.coords.latitude, position.coords.longitude);
    } catch (error) {
      if (Number(error?.code) === 5) throw locationError(5, 'Não foi possível converter a posição numa cidade', { accuracy });
      throw error;
    }

    if ((preferred && accuracy > 1000 && !regionsAgree(city, preferred))
      || (!preferred && accuracy > 15_000)) {
      throw locationError(4, 'Localização demasiado imprecisa', { accuracy, city });
    }

    setReactInputValue(input, city);
    status.className = 'one-v3-location-status is-ok';
    status.textContent = `${city} detetada pela localização do iPhone${accuracy ? ` · precisão ~${accuracy} m` : ''}. Confirma em “Guardar e adaptar a Lumina”.`;
    input.focus({ preventScroll: true });
  } catch (error) {
    status.className = 'one-v3-location-status is-warn';
    const code = Number(error?.code);
    if (code === 1) {
      status.textContent = deniedMessage(preferred);
    } else if (code === 3) {
      status.textContent = preferred
        ? `O iPhone demorou demasiado a obter uma posição. Mantive ${preferred}. Tenta novamente no exterior ou junto a uma janela.`
        : 'O iPhone demorou demasiado a obter uma posição. Tenta novamente no exterior ou junto a uma janela.';
    } else if (code === 4) {
      status.textContent = preferred
        ? `Recebi uma localização demasiado imprecisa para trocar ${preferred}. Mantive a tua cidade confirmada.`
        : 'Recebi uma localização demasiado imprecisa para escolher a tua cidade com segurança.';
    } else if (code === 5) {
      status.textContent = preferred
        ? `O iPhone deu uma posição, mas não consegui convertê-la numa cidade. Mantive ${preferred}.`
        : 'O iPhone deu uma posição, mas não consegui convertê-la numa cidade. Tenta novamente.';
    } else if (code === 6) {
      status.textContent = preferred
        ? `A localização só funciona numa ligação segura. Mantive ${preferred}.`
        : 'A localização só funciona numa ligação segura (HTTPS).';
    } else {
      status.textContent = preferred
        ? `Não consegui obter a localização do iPhone. Mantive ${preferred}. Tenta novamente e confirma que a Localização está permitida para este site no Safari.`
        : 'Não consegui obter a localização do iPhone. Tenta novamente e confirma que a Localização está permitida para este site no Safari.';
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleDecoration, { once: true });
} else {
  scheduleDecoration();
}
new MutationObserver(scheduleDecoration).observe(document.documentElement, { childList: true, subtree: true });
