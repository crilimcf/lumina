import './lumina-one-v3.css';

const TAB_NAMES = ['Pulso', 'Lumes', 'Cápsulas', 'Agora'];

function el(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
  const existing = feed.querySelector('.one-v3-feed-entry');
  if (existing) return;

  const button = el('button', 'one-v3-feed-entry');
  button.type = 'button';
  button.setAttribute('aria-label', 'Abrir Lumina One');
  button.innerHTML = `
    <span class="one-v3-feed-orbit" aria-hidden="true"><i></i></span>
    <span class="one-v3-feed-copy"><small>ONE</small><b>Descobrir agora</b><em>Pulso · Lumes · Cápsulas · Agora</em></span>
    <span class="one-v3-feed-arrow" aria-hidden="true">↗</span>`;
  button.addEventListener('click', () => original.click());
  heading.insertAdjacentElement('afterend', button);
}

function decorateShell(root) {
  root.classList.add('one-v2', 'one-v3');
  if (root.dataset.v3Shell === '1') return;
  root.dataset.v3Shell = '1';

  // Remove only artefacts from the superseded experimental One layers.
  root.querySelectorAll('.one-assist-guide,.one-v2-promise,.one-v2-location-trust,.one-v2-location-suggestion').forEach(node => node.remove());

  const eyebrow = root.querySelector('.one-eyebrow');
  if (eyebrow) eyebrow.innerHTML = '<span class="one-v3-mini-orbit">✦</span><span>LUMINA ONE</span>';
}

function attachGestures(root) {
  if (root.dataset.v3Gestures === '1') return;
  root.dataset.v3Gestures = '1';
  let gesture = null;

  const blocked = target => target?.closest?.(
    'input,textarea,select,button,a,video,[contenteditable="true"],.one-tabs,.one-contexts,.one-effect-row,.one-lume-grid,.one-camera,.one-sheet'
  );

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

    if (start.x <= 42 && dx > 72) {
      root.querySelector('.one-back')?.click();
      return;
    }

    if (Math.abs(dx) < 90) return;
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

function cleanupLegacyProductExperiments(root) {
  root.querySelectorAll(
    '.one-v3-discovery,.one-v3-together-sheet,.one-together-overlay,.one-juntos-section,.one-v3-location'
  ).forEach(node => node.remove());

  // Older discovery code hid the social empty state while it injected Radar cards.
  root.querySelectorAll('.one-pulse-page .one-state[hidden]').forEach(node => { node.hidden = false; });
  delete root.querySelector('.one-pulse-page')?.dataset.v3Discovery;
}

function simplifyAgora(root) {
  const page = root.querySelector('.one-agora-page');
  if (!page) return;
  const settingsHead = page.querySelector('.one-settings-card .one-section-head b');
  if (settingsHead) settingsHead.textContent = 'O que queres ver agora?';
}

function enhance() {
  integrateFeedEntry();
  const root = document.querySelector('.lumina-one');
  if (!root) return;
  cleanupLegacyProductExperiments(root);
  decorateShell(root);
  attachGestures(root);
  simplifyAgora(root);
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
new MutationObserver(schedule).observe(document.documentElement, {
  childList:true,
  subtree:true,
  attributes:true,
  attributeFilter:['class'],
});
