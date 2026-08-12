function setReactInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) {
    input.value = value;
  } else {
    const previous = input.value;
    setter.call(input, value);
    if (input._valueTracker) input._valueTracker.setValue(previous);
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function reverseGeocode(latitude, longitude) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('zoom', '10');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'pt-PT,pt');
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`reverse_${response.status}`);
    const data = await response.json();
    const address = data?.address || {};
    const place = address.city || address.town || address.village || address.municipality || address.county || address.state;
    if (!place) throw new Error('reverse_no_place');
    return String(place).trim().slice(0, 80);
  } finally {
    clearTimeout(timeout);
  }
}

async function approximateCity() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('/api/edge-location', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (response.status === 204) return '';
    if (!response.ok) throw new Error(`edge_location_${response.status}`);
    const data = await response.json();
    return String(data?.city || '').trim().slice(0, 80);
  } finally {
    clearTimeout(timeout);
  }
}

function prepareLocationOverride(root) {
  const box = root.querySelector('.one-auto-location');
  const button = box?.querySelector('.one-location-button');
  const status = box?.querySelector('.one-location-status');
  const recovery = box?.querySelector('.one-location-recovery');
  const input = root.querySelector('.one-agora-page .one-region-input input');
  if (!box || !button || !status || !input || button.dataset.edgeLocation === '1') return;

  button.dataset.edgeLocation = '1';

  const hideRecovery = () => {
    if (recovery) recovery.hidden = true;
    box.classList.remove('is-blocked');
  };
  const showRecovery = () => {
    if (recovery) recovery.hidden = false;
    box.classList.add('is-blocked');
  };
  const finish = (label = '◎ Atualizar a minha localização') => {
    button.disabled = false;
    button.textContent = label;
  };
  const applyCity = (city, approximate = false) => {
    setReactInputValue(input, city);
    status.className = 'one-location-status is-ok';
    status.textContent = approximate
      ? `${city} detetado aproximadamente pela tua ligação. Podes corrigir a cidade antes de guardar.`
      : `${city} detetado. Confirma em “Guardar e adaptar a Lumina” para atualizar o Radar Local.`;
    hideRecovery();
    input.focus({ preventScroll: true });
    finish();
  };

  const useApproximateFallback = async (reason = 'gps') => {
    status.className = 'one-location-status';
    status.textContent = 'O GPS não respondeu. A tentar identificar a tua cidade aproximadamente pela rede…';
    try {
      const city = await approximateCity();
      if (!city) throw new Error('edge_location_empty');
      applyCity(city, true);
      return true;
    } catch {
      status.className = 'one-location-status is-error';
      status.textContent = reason === 'denied'
        ? 'O iPhone bloqueou o GPS e também não consegui obter uma cidade aproximada. Podes autorizar no Safari ou escrever a cidade manualmente.'
        : 'Não consegui detetar a cidade automaticamente. Podes tentar novamente ou escrevê-la manualmente.';
      if (reason === 'denied') showRecovery();
      finish('◎ Tentar localização novamente');
      return false;
    }
  };

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    status.className = 'one-location-status';
    hideRecovery();
    button.disabled = true;
    button.textContent = '◎ A detetar…';

    if (!navigator.geolocation) {
      useApproximateFallback('unavailable');
      return;
    }

    status.textContent = 'A pedir a localização do iPhone…';
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const city = await reverseGeocode(position.coords.latitude, position.coords.longitude);
        applyCity(city, false);
      } catch {
        await useApproximateFallback('reverse');
      }
    }, async error => {
      await useApproximateFallback(error?.code === 1 ? 'denied' : 'gps');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }, { capture: true });
}

let scheduled = false;
function enhance() {
  const root = document.querySelector('.lumina-one');
  if (root) prepareLocationOverride(root);
}
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhance();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
else schedule();

new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
