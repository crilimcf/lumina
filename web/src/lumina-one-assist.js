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
  ['Juntos', 'Escolhe um conteúdo no Pulso ou Radar, cria uma sessão e envia o convite. Quem entrar vê o mesmo conteúdo contigo.'],
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

function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
}

function isStandaloneWebApp() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone);
}

function geolocationErrorMessage(error) {
  if (error?.code === 1) return 'O iPhone bloqueou a localização deste site. Podes corrigir abaixo ou escrever a cidade manualmente.';
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
  const button = element('button', 'one-location-button', '◎ Usar a minha localização');
  button.type = 'button';
  const privacy = element('small', '', 'Só pedimos a localização quando tocares aqui. A Lumina usa-a para identificar a cidade; latitude e longitude não ficam guardadas na tua conta.');
  const status = element('div', 'one-location-status', 'Também podes continuar a escrever a cidade manualmente.');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const recovery = element('div', 'one-location-recovery');
  recovery.hidden = true;
  recovery.append(
    element('b', '', 'No iPhone, a permissão é do site — não procures “Lumina” na lista de apps.'),
    element('p', '', 'A Lumina instalada no ecrã principal é um web app. Se o site ficou bloqueado, abre-o no Safari e altera a permissão específica do site.'),
  );
  const steps = element('ol', '');
  for (const step of [
    'Abre a Lumina no Safari pelo botão abaixo.',
    'No Safari, abre o menu da página e entra em Definições do Site.',
    'Em Localização escolhe Permitir (ou Perguntar), volta à Lumina e tenta novamente.',
  ]) steps.append(element('li', '', step));
  recovery.append(steps);

  const safariLink = element('a', 'one-location-safari', 'Abrir Lumina no Safari para autorizar');
  const safariUrl = new URL(window.location.origin);
  safariUrl.searchParams.set('one', 'agora');
  safariLink.href = safariUrl.toString();
  safariLink.target = '_blank';
  safariLink.rel = 'noopener';
  recovery.append(safariLink);

  if (isStandaloneWebApp()) {
    recovery.append(element('small', 'one-location-webapp-note', 'Depois de autorizares o site no Safari, fecha esta janela, volta à Lumina instalada e toca em “Tentar localização novamente”.'));
  }

  box.append(button, privacy, status, recovery);
  label.insertAdjacentElement('afterend', box);

  const showRecovery = () => {
    recovery.hidden = false;
    box.classList.add('is-blocked');
  };
  const hideRecovery = () => {
    recovery.hidden = true;
    box.classList.remove('is-blocked');
  };

  button.addEventListener('click', () => {
    status.className = 'one-location-status';
    hideRecovery();
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
      if (error?.code === 1) showRecovery();
      button.disabled = false;
      button.textContent = '◎ Tentar localização novamente';
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });
}

function togetherSourceLabel(value) {
  const source = String(value || '').toLowerCase();
  if (source === 'post') return 'Publicação';
  if (source === 'radar') return 'Radar';
  if (source === 'live') return 'Direto';
  return 'Conteúdo';
}

function togetherInviteId(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value, window.location.origin);
    if (url.searchParams.get('one') === 'together' && url.searchParams.get('id')) return url.searchParams.get('id').trim();
  } catch {}
  const match = value.match(/[?&]id=([^&#\s]+)/i);
  if (match) {
    try { return decodeURIComponent(match[1]).trim(); } catch { return match[1].trim(); }
  }
  return value;
}

function clickOneTab(root, label) {
  const button = [...root.querySelectorAll('.one-tabs button')].find(node => node.textContent?.trim().includes(label));
  button?.click();
}

function scrollToRadar(root) {
  const section = [...root.querySelectorAll('.one-agora-page > section')].find(node => node.querySelector('.one-section-head span')?.textContent?.trim() === 'RADAR LOCAL');
  section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ensureTogether(root) {
  const section = root.querySelector('.one-juntos-section');
  if (!section) return;

  const headTitle = section.querySelector('.one-section-head b');
  if (headTitle && headTitle.textContent !== 'Vê e reage com amigos') headTitle.textContent = 'Vê e reage com amigos';

  const join = section.querySelector('.one-join');
  if (!join) return;

  if (!section.querySelector('.one-juntos-intro')) {
    const intro = element('div', 'one-juntos-intro');
    intro.append(
      element('b', '', 'O que é o Juntos?'),
      element('p', '', 'Abres uma publicação, vídeo ou item do Radar com amigos. Se for vídeo, todos acompanham a mesma reprodução do anfitrião.'),
    );
    const steps = element('div', 'one-juntos-steps');
    for (const [number, text] of [
      ['1', 'Escolhe algo no Pulso ou Radar'],
      ['2', 'Toca em Juntos nesse conteúdo'],
      ['3', 'Partilha o convite com os teus amigos'],
    ]) {
      const row = element('div', '');
      row.append(element('span', '', number), element('b', '', text));
      steps.append(row);
    }
    const actions = element('div', 'one-juntos-actions');
    const pulse = element('button', 'is-primary', 'Escolher no Pulso');
    pulse.type = 'button';
    pulse.addEventListener('click', () => clickOneTab(root, 'Pulso'));
    const radar = element('button', '', 'Ver Radar Local');
    radar.type = 'button';
    radar.addEventListener('click', () => scrollToRadar(root));
    actions.append(pulse, radar);
    intro.append(steps, actions);
    section.querySelector('.one-section-head')?.insertAdjacentElement('afterend', intro);
  }

  if (!join.querySelector('.one-join-copy')) {
    const copy = element('div', 'one-join-copy');
    copy.append(element('b', '', 'Recebeste um convite?'), element('span', '', 'Cola aqui o link que te enviaram. Não precisas de saber nenhum código.'));
    join.prepend(copy);
  }

  const input = join.querySelector('input');
  const button = join.querySelector('button');
  if (input) {
    input.placeholder = 'Cola o link do convite';
    input.setAttribute('aria-label', 'Link do convite Juntos');
    if (!input.dataset.inviteAssist) {
      input.dataset.inviteAssist = '1';
      input.addEventListener('input', () => {
        const normalized = togetherInviteId(input.value);
        if (normalized && normalized !== input.value && /^https?:/i.test(input.value.trim())) setNativeInputValue(input, normalized);
      });
      input.addEventListener('paste', event => {
        const pasted = event.clipboardData?.getData('text') || '';
        const normalized = togetherInviteId(pasted);
        if (!normalized || normalized === pasted.trim()) return;
        event.preventDefault();
        setReactInputValue(input, normalized);
      });
    }
  }
  if (button && button.textContent !== 'Entrar com convite') button.textContent = 'Entrar com convite';
  join.classList.add('is-assisted');

  const list = section.querySelector('.one-together-list');
  if (list) {
    const rows = [...list.querySelectorAll(':scope > button')];
    let title = section.querySelector('.one-together-active-title');
    if (rows.length && !title) {
      title = element('b', 'one-together-active-title', 'As tuas sessões');
      list.insertAdjacentElement('beforebegin', title);
    } else if (!rows.length && title) title.remove();

    for (const row of rows) {
      const meta = row.querySelector('section span');
      if (!meta) continue;
      const match = meta.textContent.match(/^(\d+)\s+juntos\s+·\s+(.+)$/i);
      if (match) meta.textContent = `${match[1]} ${Number(match[1]) === 1 ? 'pessoa' : 'pessoas'} · ${togetherSourceLabel(match[2])}`;
    }
  }

  const empty = [...section.querySelectorAll('.one-state')].find(node => node.parentElement === section);
  const emptyCopy = 'Ainda não tens sessões ativas. Escolhe algo no Pulso ou Radar e toca em Juntos para começar.';
  if (empty && empty.textContent !== emptyCopy) empty.textContent = emptyCopy;
}

let scheduled = false;
function enhance() {
  const root = document.querySelector('.lumina-one');
  if (!root) return;
  ensureGuide(root);
  ensureLocation(root);
  ensureTogether(root);
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
