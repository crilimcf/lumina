import './lumina-one-v2.css';

const CONFIRMED_REGION_KEY = 'lumina-one-confirmed-region-v2';
const TABS = ['Pulso', 'Lumes', 'Cápsulas', 'Agora'];

function el(tag, className, text) {
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

function activeTab(root) {
  return root.querySelector('.one-tabs button.is-on span')?.textContent?.trim() || 'Pulso';
}

function clickTab(root, name) {
  const button = [...root.querySelectorAll('.one-tabs button')].find(node => node.textContent?.trim().includes(name));
  button?.click();
}

function enhanceShell(root) {
  root.classList.add('one-v2');
  if (root.dataset.v2Shell === '1') return;
  root.dataset.v2Shell = '1';

  const title = root.querySelector('.one-title-wrap');
  if (title && !title.querySelector('.one-v2-promise')) {
    const promise = el('div', 'one-v2-promise');
    promise.append(el('span', '', 'DESCOBRIR'), el('i', '', '•'), el('span', '', 'CRIAR'), el('i', '', '•'), el('span', '', 'VIVER JUNTOS'));
    title.append(promise);
  }
}

function attachGestures(root) {
  if (root.dataset.v2Gestures === '1') return;
  root.dataset.v2Gestures = '1';
  let gesture = null;

  const blockedTarget = target => target?.closest?.('input,textarea,select,[contenteditable="true"],video,.one-tabs,.one-contexts,.one-effect-row,.one-lume-grid,.one-camera,.one-sheet,.one-together-overlay a');

  root.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (blockedTarget(event.target)) return;
    gesture = { id:event.pointerId, x:event.clientX, y:event.clientY, at:Date.now() };
  }, { passive:true });

  root.addEventListener('pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const start = gesture;
    gesture = null;
    if (Date.now() - start.at > 850) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) > 72) return;

    const overlay = root.querySelector('.one-together-overlay');
    if (start.x <= 58 && dx > 78) {
      if (overlay) overlay.querySelector('.one-together-header button')?.click();
      else root.querySelector('.one-back')?.click();
      return;
    }

    if (overlay || Math.abs(dx) < 100 || start.x <= 58) return;
    const current = activeTab(root);
    const index = TABS.indexOf(current);
    if (index < 0) return;
    const next = dx < 0 ? Math.min(TABS.length - 1, index + 1) : Math.max(0, index - 1);
    if (next !== index) clickTab(root, TABS[next]);
  }, { passive:true });
}

async function reverseGeocode(latitude, longitude) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
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

function approximateCity() {
  return apiFetch('/edge-location').then(data => String(data?.city || '').trim().slice(0, 80));
}

function ensureLocationV2(root) {
  const page = root.querySelector('.one-agora-page');
  const box = page?.querySelector('.one-auto-location');
  const button = box?.querySelector('.one-location-button');
  const status = box?.querySelector('.one-location-status');
  const recovery = box?.querySelector('.one-location-recovery');
  const input = page?.querySelector('.one-region-input input');
  const save = page?.querySelector('.one-settings-card > .one-primary');
  if (!box || !button || !status || !input || !save) return;

  if (!page.querySelector('.one-v2-location-trust')) {
    const trust = el('div', 'one-v2-location-trust');
    trust.innerHTML = '<span>◉</span><div><b>A cidade é tua decisão</b><small>GPS é preciso. A rede é apenas uma sugestão e nunca substitui uma cidade que já escolheste.</small></div>';
    box.insertAdjacentElement('beforebegin', trust);
  }

  if (save.dataset.v2RegionSave !== '1') {
    save.dataset.v2RegionSave = '1';
    save.addEventListener('click', () => {
      const value = input.value.trim();
      if (value) localStorage.setItem(CONFIRMED_REGION_KEY, value);
      else localStorage.removeItem(CONFIRMED_REGION_KEY);
    }, { capture:true });
  }

  if (button.dataset.v2Location === '1') return;
  button.dataset.v2Location = '1';

  const clearSuggestion = () => box.querySelector('.one-v2-location-suggestion')?.remove();
  const hideRecovery = () => {
    if (recovery) recovery.hidden = true;
    box.classList.remove('is-blocked');
  };
  const finish = (label = '◎ Atualizar a minha localização') => {
    button.disabled = false;
    button.textContent = label;
  };
  const currentPreferred = () => input.value.trim() || localStorage.getItem(CONFIRMED_REGION_KEY) || '';

  const applyPrecise = city => {
    setReactInputValue(input, city);
    status.className = 'one-location-status is-ok';
    status.textContent = `${city} detetado pelo GPS. Confirma em “Guardar e adaptar a Lumina”.`;
    clearSuggestion();
    hideRecovery();
    finish();
  };

  const showApproximate = city => {
    clearSuggestion();
    const preferred = currentPreferred();
    if (preferred) {
      status.className = 'one-location-status is-ok';
      status.textContent = `O GPS não respondeu. Mantive ${preferred}, porque esta cidade já foi escolhida por ti.`;
      finish('◎ Tentar GPS novamente');
      return;
    }

    status.className = 'one-location-status';
    status.textContent = 'Não consegui obter GPS preciso. A rede só consegue dar uma sugestão aproximada.';
    const card = el('div', 'one-v2-location-suggestion');
    const copy = el('div', '');
    copy.append(el('span', '', 'LOCALIZAÇÃO APROXIMADA'), el('b', '', city), el('small', '', 'Pode estar errada — por exemplo, a rede móvel pode indicar a cidade do operador.'));
    const actions = el('div', 'one-v2-location-actions');
    const use = el('button', 'is-primary', `Usar ${city}`);
    use.type = 'button';
    use.addEventListener('click', () => {
      setReactInputValue(input, city);
      status.className = 'one-location-status';
      status.textContent = `${city} foi apenas sugerida. Revê e guarda se estiver correta.`;
      card.remove();
      input.focus({ preventScroll:true });
    });
    const edit = el('button', '', 'Escrever a minha cidade');
    edit.type = 'button';
    edit.addEventListener('click', () => { card.remove(); input.focus(); });
    const ignore = el('button', 'is-quiet', 'Ignorar');
    ignore.type = 'button';
    ignore.addEventListener('click', () => { card.remove(); status.textContent = 'Sem problema — podes escrever a cidade manualmente quando quiseres.'; });
    actions.append(use, edit, ignore);
    card.append(copy, actions);
    status.insertAdjacentElement('afterend', card);
    finish('◎ Tentar GPS novamente');
  };

  const fallback = async () => {
    const preferred = currentPreferred();
    if (preferred) {
      status.className = 'one-location-status is-ok';
      status.textContent = `O GPS não respondeu. Mantive ${preferred}, porque esta cidade já foi escolhida por ti.`;
      finish('◎ Tentar GPS novamente');
      return;
    }
    status.textContent = 'GPS indisponível. A procurar apenas uma sugestão aproximada…';
    try {
      const city = await approximateCity();
      if (!city) throw new Error('no_city');
      showApproximate(city);
    } catch {
      status.className = 'one-location-status is-error';
      status.textContent = 'Não consegui detetar a cidade. Escreve-a manualmente ou tenta o GPS novamente.';
      finish('◎ Tentar localização novamente');
    }
  };

  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    clearSuggestion();
    hideRecovery();
    button.disabled = true;
    button.textContent = '◎ A detetar…';
    status.className = 'one-location-status';
    status.textContent = 'A tentar obter a localização precisa do iPhone…';

    if (!navigator.geolocation) return void fallback();
    navigator.geolocation.getCurrentPosition(async position => {
      try { applyPrecise(await reverseGeocode(position.coords.latitude, position.coords.longitude)); }
      catch { await fallback(); }
    }, fallback, { enableHighAccuracy:true, timeout:10000, maximumAge:120000 });
  }, { capture:true });
}

function radarCard(item, onTogether) {
  const card = el('article', 'one-v2-pulse-seed-card');
  if (item.image_url) {
    const image = el('img', 'one-v2-pulse-seed-image');
    image.src = item.image_url;
    image.alt = '';
    image.loading = 'lazy';
    card.append(image);
  } else {
    const visual = el('div', 'one-v2-pulse-seed-visual', 'L');
    card.append(visual);
  }
  const shade = el('div', 'one-v2-pulse-seed-shade');
  const copy = el('div', 'one-v2-pulse-seed-copy');
  const meta = el('div', 'one-v2-pulse-seed-meta');
  meta.append(el('span', '', item.type === 'event' ? 'EVENTO' : 'RADAR'), el('span', '', item.region || item.source_name || 'Agora'));
  copy.append(meta, el('h3', '', item.title), el('p', '', item.summary || 'Descobre o que está a acontecer agora.'));
  const actions = el('div', 'one-v2-pulse-seed-actions');
  if (item.external_url) {
    const open = el('a', 'is-primary', 'Abrir');
    open.href = item.external_url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    actions.append(open);
  }
  const together = el('button', '', 'Juntos');
  together.type = 'button';
  together.addEventListener('click', () => onTogether(item, together));
  actions.append(together);
  card.append(shade, copy, actions);
  return card;
}

async function startRadarTogether(item, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'A criar…';
  try {
    const session = await apiFetch('/one/together', {
      method:'POST',
      body:JSON.stringify({ sourceType:'radar', sourceId:item.id, title:item.title }),
    });
    const url = new URL(window.location.href);
    url.searchParams.set('one', 'together');
    url.searchParams.set('id', session.id);
    window.location.assign(url.toString());
  } catch {
    button.disabled = false;
    button.textContent = original;
  }
}

async function ensurePulseDiscovery(root) {
  const page = root.querySelector('.one-pulse-page');
  if (!page) return;

  const seeds = [...page.querySelectorAll('.one-v2-pulse-seed')];
  const seed = seeds.shift() || null;
  seeds.forEach(node => node.remove());

  if (page.querySelector('.one-pulse-card')) {
    seed?.remove();
    page.dataset.v2Discovery = 'social';
    return;
  }

  const empty = [...page.querySelectorAll('.one-state')].find(node =>
    /Pulso está a aquecer|O teu círculo ainda está silencioso/i.test(node.textContent || '')
  );
  if (!empty) return;

  const scope = page.querySelector('.one-segment button.is-on')?.textContent?.trim();
  if (scope === 'Amigos') {
    if (seed) seed.hidden = true;
    empty.style.display = '';
    empty.classList.add('one-v2-friends-empty');
    empty.innerHTML = '<span class="one-v2-empty-orb">◎</span><b>O teu círculo ainda está silencioso</b><span>Segue pessoas e, quando publicarem, aparecem aqui sem mistura com o resto do Pulso.</span>';
    page.dataset.v2Discovery = 'friends';
    return;
  }

  empty.classList.remove('one-v2-friends-empty');
  empty.style.display = 'none';
  if (seed) {
    seed.hidden = false;
    page.dataset.v2Discovery = 'ready';
    return;
  }
  if (page.dataset.v2Discovery === 'loading') return;

  page.dataset.v2Discovery = 'loading';
  const section = el('section', 'one-v2-pulse-seed');
  section.innerHTML = '<div class="one-v2-seed-head"><div><span>COMEÇA JÁ</span><b>Há sempre algo para descobrir</b></div><small>Radar + tua rede</small></div><div class="one-v2-seed-loading">A montar o teu primeiro Pulso…</div>';
  empty.insertAdjacentElement('afterend', section);

  try {
    const prefs = await apiFetch('/one/preferences').catch(() => ({}));
    const region = String(prefs?.local_region || localStorage.getItem(CONFIRMED_REGION_KEY) || '').trim();
    let items = [];
    if (region) items = (await apiFetch(`/one/local?region=${encodeURIComponent(region)}`).catch(() => null))?.items || [];
    if (items.length < 3) {
      const global = (await apiFetch('/radar?limit=8').catch(() => null))?.items || [];
      const seen = new Set(items.map(item => String(item.id)));
      items.push(...global.filter(item => !seen.has(String(item.id))));
    }
    items = items.slice(0, 8);
    section.querySelector('.one-v2-seed-loading')?.remove();
    if (!items.length) {
      section.append(el('div', 'one-v2-seed-empty', 'O Radar está a atualizar. Volta dentro de momentos ou publica algo teu.'));
    } else {
      const rail = el('div', 'one-v2-pulse-seed-stack');
      items.forEach(item => rail.append(radarCard(item, startRadarTogether)));
      section.append(rail);
    }
    const currentScope = page.querySelector('.one-segment button.is-on')?.textContent?.trim();
    section.hidden = currentScope === 'Amigos';
  } finally {
    page.dataset.v2Discovery = 'ready';
  }
}

async function contextualizeTogether(root) {
  const overlay = root.querySelector('.one-together-overlay');
  if (!overlay || overlay.dataset.v2Context === 'loading' || overlay.dataset.v2Context === 'ready') return;
  const title = overlay.querySelector('.one-together-header b')?.textContent?.trim();
  if (!title) return;
  overlay.dataset.v2Context = 'loading';

  try {
    const sessions = await apiFetch('/one/together');
    const session = (sessions || []).find(item => item.title === title) || (sessions || [])[0];
    if (!session) throw new Error('session_missing');
    const source = await apiFetch(`/one/source/${encodeURIComponent(session.source_type)}/${encodeURIComponent(session.source_id)}`);
    const isVideo = source?.media_mime?.startsWith('video/') || source?.recording_mime?.startsWith('video/');
    const bottom = overlay.querySelector('.one-together-bottom');
    const sync = bottom?.querySelector('.one-sync-controls,.one-sync-status');

    if (source?.type !== 'post' || !isVideo) {
      if (sync) sync.style.display = 'none';
      if (bottom && !bottom.querySelector('.one-v2-together-actions')) {
        const actions = el('div', 'one-v2-together-actions');
        const copy = el('div', 'one-v2-together-action-copy');
        if (source?.type === 'radar') {
          copy.append(el('span', '', 'LER JUNTOS'), el('b', '', 'Aqui não há botão Play'), el('small', '', 'É uma notícia: abre a fonte e partilha o convite. Reprodução só aparece quando o conteúdo é vídeo.'));
        } else if (source?.type === 'live') {
          copy.append(el('span', '', 'DIRETO JUNTOS'), el('b', '', 'Entra no direto com a tua rede'), el('small', '', 'O player do Live trata da reprodução; esta sessão mantém o grupo junto.'));
        } else {
          copy.append(el('span', '', 'VER JUNTOS'), el('b', '', 'Partilha e reage ao mesmo conteúdo'), el('small', '', 'Controlos de reprodução só aparecem quando existe vídeo.'));
        }
        const row = el('div', 'one-v2-together-action-row');
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

    const radar = overlay.querySelector('.one-together-radar');
    if (radar && source?.source_name && !radar.querySelector('.one-v2-source')) {
      radar.append(el('small', 'one-v2-source', `Fonte: ${source.source_name}`));
    }
    overlay.dataset.v2Kind = source?.type || 'content';
    overlay.dataset.v2Context = 'ready';
  } catch {
    overlay.dataset.v2Context = 'idle';
  }
}

function tuneCopy(root) {
  const page = root.querySelector('.one-agora-page');
  const togetherTitle = page?.querySelector('.one-juntos-section .one-section-head b');
  if (togetherTitle && togetherTitle.textContent === 'Vê e reage com amigos') togetherTitle.textContent = 'Um conteúdo. A mesma conversa.';
}

let scheduled = false;
function enhance() {
  const root = document.querySelector('.lumina-one');
  if (!root) return;
  enhanceShell(root);
  attachGestures(root);
  ensureLocationV2(root);
  ensurePulseDiscovery(root).catch(() => {});
  contextualizeTogether(root).catch(() => {});
  tuneCopy(root);
}

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

new MutationObserver(schedule).observe(document.documentElement, {
  childList:true,
  subtree:true,
  attributes:true,
  attributeFilter:['class','hidden'],
});