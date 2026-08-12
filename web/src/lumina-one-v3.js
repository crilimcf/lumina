import './lumina-one-v3.css';

const REGION_KEY = 'lumina-one-confirmed-region-v3';
const TAB_NAMES = ['Pulso', 'Lumes', 'Cápsulas', 'Agora'];

function el(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function apiFetch(path, options = {}) {
  return fetch(`/api${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  }).then(async response => {
    if (response.status === 204) return null;
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
    return body;
  });
}

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

function cleanText(value = '') {
  const text = String(value || '');
  if (!text.includes('&')) return text.replace(/\s+/g, ' ').trim();
  const area = document.createElement('textarea');
  area.innerHTML = text;
  return area.value.replace(/\s+/g, ' ').trim();
}

function activeTab(root) {
  return root.querySelector('.one-tabs button.is-on span')?.textContent?.trim() || 'Pulso';
}

function clickTab(root, name) {
  [...root.querySelectorAll('.one-tabs button')]
    .find(node => node.textContent?.trim().includes(name))?.click();
}

function integrateFeedEntry() {
  const original = document.querySelector('.one-app-launch');
  const feed = document.querySelector('.lumina-feed');
  const heading = feed?.querySelector('.lumina-moments-wrap .lumina-section-heading');
  if (!original || !heading) return;
  original.classList.add('one-v3-original-entry');
  if (feed.querySelector('.one-v3-feed-entry')) return;

  const button = el('button', 'one-v3-feed-entry');
  button.type = 'button';
  button.setAttribute('aria-label', 'Abrir Lumina One');
  button.innerHTML = `
    <span class="one-v3-feed-orbit" aria-hidden="true"><i></i></span>
    <span class="one-v3-feed-copy"><small>ONE</small><b>Descobrir agora</b><em>Pulso · Lumes · Cápsulas · Juntos</em></span>
    <span class="one-v3-feed-arrow" aria-hidden="true">↗</span>`;
  button.addEventListener('click', () => original.click());
  heading.insertAdjacentElement('afterend', button);
}

function decorateShell(root) {
  root.classList.add('one-v2', 'one-v3');
  if (root.dataset.v3Shell === '1') return;
  root.dataset.v3Shell = '1';

  root.querySelectorAll('.one-assist-guide,.one-v2-promise,.one-v2-location-trust,.one-v2-location-suggestion').forEach(node => node.remove());
  const eyebrow = root.querySelector('.one-eyebrow');
  if (eyebrow) eyebrow.innerHTML = '<span class="one-v3-mini-orbit">✦</span><span>LUMINA ONE</span>';
  const title = root.querySelector('.one-title-wrap h1');
  if (title) title.innerHTML = 'Tudo ligado. <i>Sem saltar.</i>';
  const subtitle = root.querySelector('.one-title-wrap > p');
  if (subtitle) subtitle.textContent = 'Descobre, cria e partilha numa experiência contínua.';
}

function attachGestures(root) {
  if (root.dataset.v3Gestures === '1') return;
  root.dataset.v3Gestures = '1';
  let gesture = null;
  const blocked = target => target?.closest?.('input,textarea,select,button,a,video,[contenteditable="true"],.one-tabs,.one-contexts,.one-effect-row,.one-lume-grid,.one-camera,.one-sheet');

  const begin = (x, y, id = 0, target) => {
    if (blocked(target)) return;
    gesture = { x, y, id, at:Date.now() };
  };
  const end = (x, y, id = 0) => {
    if (!gesture || gesture.id !== id) return;
    const start = gesture;
    gesture = null;
    if (Date.now() - start.at > 900) return;
    const dx = x - start.x;
    const dy = y - start.y;
    if (Math.abs(dy) > 70) return;
    const overlay = root.querySelector('.one-together-overlay,.one-v3-together-sheet');
    if (start.x <= 42 && dx > 72) {
      if (overlay) overlay.querySelector('[data-one-v3-close],.one-together-header button')?.click();
      else root.querySelector('.one-back')?.click();
      return;
    }
    if (overlay || Math.abs(dx) < 90) return;
    const index = TAB_NAMES.indexOf(activeTab(root));
    if (index < 0) return;
    const next = dx < 0 ? Math.min(TAB_NAMES.length - 1, index + 1) : Math.max(0, index - 1);
    if (next !== index) clickTab(root, TAB_NAMES[next]);
  };

  root.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    begin(event.clientX, event.clientY, event.pointerId, event.target);
  }, { passive:true });
  root.addEventListener('pointerup', event => end(event.clientX, event.clientY, event.pointerId), { passive:true });
  root.addEventListener('touchstart', event => {
    const touch = event.touches[0];
    if (touch) begin(touch.clientX, touch.clientY, 999, event.target);
  }, { passive:true });
  root.addEventListener('touchend', event => {
    const touch = event.changedTouches[0];
    if (touch) end(touch.clientX, touch.clientY, 999);
  }, { passive:true });
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
    const response = await fetch(url, { signal:controller.signal, headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error(`reverse_${response.status}`);
    const data = await response.json();
    const address = data?.address || {};
    const city = address.city || address.town || address.village || address.municipality || address.county || address.state;
    if (!city) throw new Error('reverse_no_city');
    return String(city).trim().slice(0, 80);
  } finally { clearTimeout(timer); }
}

function precisePosition(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('gps_unavailable'));
    let best = null;
    let watchId = null;
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best && Number(best.coords?.accuracy || Infinity) <= 5000) resolve(best);
      else reject(error || new Error('gps_not_precise'));
    };
    const timer = setTimeout(() => finish(new Error('gps_timeout')), timeoutMs);
    watchId = navigator.geolocation.watchPosition(position => {
      if (!best || Number(position.coords.accuracy || Infinity) < Number(best.coords.accuracy || Infinity)) best = position;
      if (Number(position.coords.accuracy || Infinity) <= 350) finish();
    }, error => finish(error || new Error('gps_failed')), {
      enableHighAccuracy:true,
      maximumAge:0,
      timeout:timeoutMs,
    });
  });
}

function ensureLocation(root) {
  const page = root.querySelector('.one-agora-page');
  const settings = page?.querySelector('.one-settings-card');
  const input = settings?.querySelector('.one-region-input input');
  const save = settings?.querySelector(':scope > .one-primary');
  if (!page || !settings || !input || !save) return;

  if (input.dataset.v3Confirmed !== '1') {
    input.dataset.v3Confirmed = '1';
    const confirmed = localStorage.getItem(REGION_KEY);
    if (confirmed && !input.value.trim()) setReactInputValue(input, confirmed);
    save.addEventListener('click', () => {
      const value = input.value.trim();
      if (value) localStorage.setItem(REGION_KEY, value);
      else localStorage.removeItem(REGION_KEY);
    }, { capture:true });
  }

  if (settings.querySelector('.one-v3-location')) return;
  const location = el('div', 'one-v3-location');
  const copy = el('div', 'one-v3-location-copy');
  copy.innerHTML = '<span>LOCALIZAÇÃO</span><b>A tua cidade, sem adivinhações</b><small>O One usa GPS quando o iPhone o permite. Nunca usa Wi‑Fi/4G para substituir uma cidade escolhida por ti.</small>';
  const button = el('button', 'one-v3-location-button', 'Usar GPS preciso');
  button.type = 'button';
  const status = el('div', 'one-v3-location-status');
  location.append(copy, button, status);
  save.insertAdjacentElement('beforebegin', location);

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'A procurar sinal GPS…';
    status.className = 'one-v3-location-status';
    status.textContent = 'Pode demorar alguns segundos até o iPhone obter uma posição precisa.';
    try {
      const position = await precisePosition();
      const accuracy = Math.round(Number(position.coords.accuracy || 0));
      const city = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      setReactInputValue(input, city);
      status.className = 'one-v3-location-status is-ok';
      status.textContent = `${city} detetada por GPS${accuracy ? ` · precisão ~${accuracy} m` : ''}. Confirma em “Guardar e adaptar a Lumina”.`;
      input.focus({ preventScroll:true });
    } catch (error) {
      const preferred = input.value.trim() || localStorage.getItem(REGION_KEY) || '';
      status.className = 'one-v3-location-status is-warn';
      status.textContent = preferred
        ? `O GPS do iPhone não respondeu. Mantive ${preferred}. Não vou trocar a tua cidade por uma estimativa da rede.`
        : 'O GPS do iPhone não respondeu. Escreve a tua cidade acima; não vamos usar uma estimativa da rede como se fosse a tua localização.';
    } finally {
      button.disabled = false;
      button.textContent = 'Tentar GPS novamente';
    }
  });
}

function shareSession(session, item) {
  const url = new URL(window.location.href);
  url.searchParams.set('one', 'together');
  url.searchParams.set('id', session.id);
  const text = `Vem ver isto comigo na Lumina · ${cleanText(item.title)}`;
  if (navigator.share) return navigator.share({ title:'Lumina Juntos', text, url:url.toString() }).catch(() => {});
  return navigator.clipboard?.writeText(url.toString()).catch(() => {});
}

function openTogetherSheet(root, item, session) {
  root.querySelector('.one-v3-together-sheet')?.remove();
  const overlay = el('div', 'one-v3-together-sheet');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Juntos criado');
  const card = el('div', 'one-v3-together-card');
  const close = el('button', 'one-v3-sheet-close', '×');
  close.type = 'button';
  close.dataset.oneV3Close = '1';
  close.setAttribute('aria-label', 'Fechar Juntos');
  close.addEventListener('click', () => overlay.remove());
  const mark = el('div', 'one-v3-together-mark', '◎');
  const label = el('span', 'one-v3-kicker', 'JUNTOS CRIADO');
  const title = el('h3', '', cleanText(item.title));
  const body = el('p', '', 'Agora há uma sessão real para este conteúdo. Partilha o convite; quando alguém entrar, ficam ligados ao mesmo momento.');
  const actions = el('div', 'one-v3-together-actions');
  const share = el('button', 'is-primary', 'Partilhar convite');
  share.type = 'button';
  share.addEventListener('click', async () => { await shareSession(session, item); share.textContent = 'Convite pronto ✓'; setTimeout(() => { share.textContent = 'Partilhar convite'; }, 1600); });
  actions.append(share);
  if (item.external_url) {
    const open = el('a', '', 'Abrir notícia');
    open.href = item.external_url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    actions.append(open);
  }
  const enter = el('button', '', 'Entrar na sessão');
  enter.type = 'button';
  enter.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('one', 'together');
    url.searchParams.set('id', session.id);
    window.location.assign(url.toString());
  });
  actions.append(enter);
  card.append(close, mark, label, title, body, actions);
  overlay.append(card);
  root.append(overlay);
}

async function startRadarTogether(root, item, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'A criar…';
  try {
    const session = await apiFetch('/one/together', {
      method:'POST',
      body:JSON.stringify({ sourceType:'radar', sourceId:item.id, title:cleanText(item.title) }),
    });
    openTogetherSheet(root, item, session);
    button.textContent = 'Juntos ✓';
  } catch (error) {
    button.textContent = 'Tentar novamente';
    const note = el('small', 'one-v3-card-error', `Não foi possível criar Juntos: ${error.message}`);
    button.closest('.one-v3-discovery-card')?.append(note);
  } finally {
    button.disabled = false;
    if (button.textContent === 'A criar…') button.textContent = original;
  }
}

function radarCard(root, item) {
  const card = el('article', 'one-v3-discovery-card');
  const visual = el('div', 'one-v3-discovery-visual');
  if (item.image_url) {
    const image = el('img', '');
    image.src = item.image_url;
    image.alt = '';
    image.loading = 'lazy';
    visual.append(image);
  } else {
    visual.innerHTML = '<span class="one-v3-visual-orbit">✦</span><i></i>';
  }
  const copy = el('div', 'one-v3-discovery-copy');
  const meta = el('div', 'one-v3-discovery-meta');
  meta.append(el('span', '', item.type === 'event' ? 'EVENTO' : 'RADAR'), el('span', '', cleanText(item.region || item.source_name || 'Agora')));
  const title = el('h3', '', cleanText(item.title));
  const summary = el('p', '', cleanText(item.summary || 'Descobre o que está a acontecer agora.'));
  const actions = el('div', 'one-v3-discovery-actions');
  if (item.external_url) {
    const open = el('a', 'is-primary', 'Abrir');
    open.href = item.external_url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    actions.append(open);
  }
  const together = el('button', '', 'Juntos');
  together.type = 'button';
  together.addEventListener('click', () => startRadarTogether(root, item, together));
  actions.append(together);
  copy.append(meta, title, summary, actions);
  card.append(visual, copy);
  return card;
}

async function ensurePulseDiscovery(root) {
  const page = root.querySelector('.one-pulse-page');
  if (!page) return;
  const scope = page.querySelector('.one-segment button.is-on')?.textContent?.trim();
  const hasSocial = !!page.querySelector('.one-pulse-card');
  const empty = [...page.querySelectorAll('.one-state')].find(node => /Pulso está a aquecer|círculo.*silencioso/i.test(node.textContent || ''));
  const existing = page.querySelector('.one-v3-discovery');

  if (hasSocial) {
    existing?.remove();
    if (empty) empty.hidden = true;
    return;
  }
  if (!empty) return;

  if (scope === 'Amigos') {
    existing?.remove();
    empty.hidden = false;
    empty.classList.add('one-v3-friends-empty');
    empty.innerHTML = '<span class="one-v3-empty-mark">◎</span><b>O teu círculo começa contigo</b><span>Segue pessoas e as publicações dos teus amigos aparecem aqui, sem misturar descoberta pública.</span>';
    return;
  }

  empty.hidden = true;
  if (existing || page.dataset.v3Discovery === 'loading') return;
  page.dataset.v3Discovery = 'loading';
  const section = el('section', 'one-v3-discovery');
  section.innerHTML = '<div class="one-v3-discovery-head"><div><span>AGORA</span><b>Algo que vale o teu tempo</b></div><small>desliza para continuar</small></div><div class="one-v3-discovery-loading">A ligar o teu Pulso ao Radar…</div>';
  empty.insertAdjacentElement('afterend', section);
  try {
    const prefs = await apiFetch('/one/preferences').catch(() => ({}));
    const region = String(prefs?.local_region || localStorage.getItem(REGION_KEY) || '').trim();
    let items = [];
    if (region) items = (await apiFetch(`/one/local?region=${encodeURIComponent(region)}`).catch(() => null))?.items || [];
    if (items.length < 4) {
      const global = (await apiFetch('/radar?limit=10').catch(() => null))?.items || [];
      const seen = new Set(items.map(item => String(item.id)));
      items.push(...global.filter(item => !seen.has(String(item.id))));
    }
    items = items.slice(0, 8);
    section.querySelector('.one-v3-discovery-loading')?.remove();
    if (!items.length) section.append(el('div', 'one-v3-discovery-empty', 'O Radar está a atualizar. Volta dentro de momentos.'));
    else {
      const stack = el('div', 'one-v3-discovery-stack');
      items.forEach(item => stack.append(radarCard(root, item)));
      section.append(stack);
    }
  } catch (error) {
    section.querySelector('.one-v3-discovery-loading')?.remove();
    section.append(el('div', 'one-v3-discovery-empty', `Não consegui montar a descoberta: ${error.message}`));
  } finally {
    page.dataset.v3Discovery = 'ready';
  }
}

async function contextualizeTogether(root) {
  const overlay = root.querySelector('.one-together-overlay');
  if (!overlay || overlay.dataset.v3Context === 'loading' || overlay.dataset.v3Context === 'ready') return;
  overlay.dataset.v3Context = 'loading';
  try {
    const id = new URLSearchParams(window.location.search).get('id');
    const sessions = await apiFetch('/one/together');
    const session = (sessions || []).find(item => String(item.id) === String(id)) || (sessions || [])[0];
    if (!session) throw new Error('session_missing');
    const source = await apiFetch(`/one/source/${encodeURIComponent(session.source_type)}/${encodeURIComponent(session.source_id)}`);
    const isVideo = source?.media_mime?.startsWith('video/') || source?.recording_mime?.startsWith('video/');
    const bottom = overlay.querySelector('.one-together-bottom');
    if (source?.type !== 'post' || !isVideo) {
      overlay.querySelector('.one-sync-controls,.one-sync-status')?.remove();
      if (bottom && !bottom.querySelector('.one-v3-session-actions')) {
        const actions = el('div', 'one-v3-session-actions');
        const copy = el('div', '');
        copy.innerHTML = source?.type === 'radar'
          ? '<span>LER JUNTOS</span><b>Uma notícia não é um player</b><small>Partilha o convite e abre a fonte. Reprodução só existe quando há vídeo.</small>'
          : '<span>JUNTOS</span><b>O mesmo momento, com a tua rede</b><small>Partilha o convite para trazer alguém para esta sessão.</small>';
        const row = el('div', 'one-v3-session-row');
        if (source?.type === 'radar' && source.external_url) {
          const open = el('a', 'is-primary', 'Abrir notícia');
          open.href = source.external_url;
          open.target = '_blank';
          open.rel = 'noopener noreferrer';
          row.append(open);
        }
        const share = el('button', '', 'Partilhar convite');
        share.type = 'button';
        share.addEventListener('click', () => overlay.querySelector('.one-together-header button:last-child')?.click());
        row.append(share);
        actions.append(copy, row);
        bottom.append(actions);
      }
    }
    overlay.dataset.v3Kind = source?.type || 'content';
    overlay.dataset.v3Context = 'ready';
  } catch {
    overlay.dataset.v3Context = 'ready';
  }
}

function simplifyAgora(root) {
  const page = root.querySelector('.one-agora-page');
  if (!page) return;
  page.querySelector('.one-agora-hero')?.classList.add('one-v3-quiet-hero');
  const settingsHead = page.querySelector('.one-settings-card .one-section-head b');
  if (settingsHead) settingsHead.textContent = 'O que queres ver agora?';
}

function enhance() {
  integrateFeedEntry();
  const root = document.querySelector('.lumina-one');
  if (!root) return;
  decorateShell(root);
  attachGestures(root);
  simplifyAgora(root);
  ensureLocation(root);
  ensurePulseDiscovery(root);
  contextualizeTogether(root);
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhance();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once:true });
else schedule();
new MutationObserver(schedule).observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
