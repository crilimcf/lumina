import './lumina-one-assist.css';

const HELP = {
  Pulso: 'Desliza para descobrir fotos e vídeos. “Para ti” usa as tuas preferências; “Amigos” fica na tua rede.',
  Lumes: 'Tira uma foto agora. Amigos mútuos podem vê-la uma vez e depois desaparece.',
  Cápsulas: 'Cria uma memória com amigos, junta fotos, vídeos e textos e escolhe quando pode ser aberta.',
  Agora: 'Diz o que queres ver, o contexto em que estás e a tua zona para afinar Pulso e Radar Local.',
};

const DETAILS = [
  ['Pulso', 'Scroll de descoberta com fotos, vídeos e publicações. Podes alternar entre Para ti e Amigos.'],
  ['Lumes', 'Fotografias do momento para amigos mútuos. Cada Lume abre uma vez e expira.'],
  ['Cápsulas', 'Álbuns/memórias colaborativos que podem ficar fechados até uma data escolhida.'],
  ['Agora', 'Controla temas, contexto e zona. Estas escolhas ajudam a ordenar o Pulso e o Radar Local.'],
  ['Radar Local', 'Usa a tua cidade, detetada com permissão ou escrita manualmente, para procurar conteúdo associado à zona.'],
  ['Juntos', 'No Pulso ou Radar, toca em Juntos para abrir uma sessão partilhada e sincronizada.'],
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function activeTabName(root) {
  return root.querySelector('.one-tabs button.is-on span')?.textContent?.trim() || 'Pulso';
}

function ensureGuide(root) {
  const tabs = root.querySelector('.one-tabs');
  if (!tabs) return;

  let guide = root.querySelector(':scope > .one-assist-guide');
  if (!guide) {
    guide = element('section', 'one-assist-guide');
    guide.setAttribute('aria-label', 'Como funciona o Lumina One');

    const summary = element('button', 'one-assist-summary');
    summary.type = 'button';
    summary.setAttribute('aria-expanded', 'false');

    const mark = element('span', 'one-assist-mark', '?');
    mark.setAttribute('aria-hidden', 'true');
    const copy = element('span', 'one-assist-copy');
    copy.append(element('b', '', 'Como funciona'), element('span', 'one-assist-current', ''));
    const more = element('span', 'one-assist-more', 'VER TUDO');
    summary.append(mark, copy, more);

    const details = element('div', 'one-assist-details');
    details.hidden = true;
    for (const [title, description] of DETAILS) {
      const item = element('div', 'one-assist-item');
      item.append(element('b', '', title), element('span', '', description));
      details.append(item);
    }

    summary.addEventListener('click', () => {
      const nextOpen = details.hidden;
      details.hidden = !nextOpen;
      summary.setAttribute('aria-expanded', String(nextOpen));
      more.textContent = nextOpen ? 'FECHAR' : 'VER TUDO';
    });

    guide.append(summary, details);
    tabs.insertAdjacentElement('afterend', guide);
  }

  const tab = activeTabName(root);
  const current = guide.querySelector('.one-assist-current');
  if (current && current.dataset.tab !== tab) {
    current.dataset.tab = tab;
    current.textContent = HELP[tab] || HELP.Pulso;
  }
}

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

function geolocationErrorMessage(error) {
  if (error?.code === 1) return 'Localização bloqueada. Autoriza a Lumina nas definições do iPhone ou escreve a cidade manualmente.';
  if (error?.code === 2) return 'Não foi possível obter a localização agora. Experimenta novamente ou escreve a cidade.';
  if (error?.code === 3) return 'A localização demorou demasiado. Experimenta novamente ou escreve a cidade.';
  return 'Não foi possível obter a localização. Podes continuar a escrever a cidade manualmente.';
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

function ensureLocation(root) {
  const settings = root.querySelector('.one-agora-page .one-settings-card');
  const regionWrap = settings?.querySelector('.one-region-input');
  const input = regionWrap?.querySelector('input');
  const label = regionWrap?.closest('label');
  if (!settings || !input || !label || settings.querySelector('.one-auto-location')) return;

  const box = element('div', 'one-auto-location');
  const button = element('button', '', '◎ Usar a minha localização');
  button.type = 'button';
  const privacy = element('small', '', 'Só pedimos a localização quando tocares aqui. A Lumina usa-a para identificar a cidade; latitude e longitude não ficam guardadas na tua conta.');
  const status = element('div', 'one-location-status', 'Também podes continuar a escrever a cidade manualmente.');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  box.append(button, privacy, status);
  label.insertAdjacentElement('afterend', box);

  button.addEventListener('click', () => {
    status.className = 'one-location-status';
    if (!navigator.geolocation) {
      status.classList.add('is-error');
      status.textContent = 'Este dispositivo não disponibiliza localização. Escreve a cidade manualmente.';
      return;
    }

    button.disabled = true;
    button.textContent = '◎ A detetar…';
    status.textContent = 'A pedir autorização e a identificar a tua cidade…';

    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const city = await reverseGeocode(position.coords.latitude, position.coords.longitude);
        setReactInputValue(input, city);
        status.classList.add('is-ok');
        status.textContent = `${city} detetado. Confirma em “Guardar e adaptar a Lumina” para atualizar o Radar Local.`;
        input.focus({ preventScroll: true });
      } catch {
        status.classList.add('is-error');
        status.textContent = 'Detetei a posição, mas não consegui identificar a cidade. Escreve-a manualmente.';
      } finally {
        button.disabled = false;
        button.textContent = '◎ Atualizar a minha localização';
      }
    }, error => {
      status.classList.add('is-error');
      status.textContent = geolocationErrorMessage(error);
      button.disabled = false;
      button.textContent = '◎ Tentar localização novamente';
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });
}

let scheduled = false;
function enhance() {
  const root = document.querySelector('.lumina-one');
  if (!root) return;
  ensureGuide(root);
  ensureLocation(root);
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhance();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true });
else scheduleEnhance();

new MutationObserver(scheduleEnhance).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class'],
});
