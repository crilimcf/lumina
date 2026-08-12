const REGION_KEY = 'lumina-one-confirmed-region-v3';

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

function stabilize() {
  const feed = document.querySelector('.lumina-feed');
  const entry = feed?.querySelector('.one-v3-feed-entry');
  const moments = feed?.querySelector('.lumina-moments-wrap .lumina-moments');
  if (entry && moments && entry.previousElementSibling !== moments) {
    moments.insertAdjacentElement('afterend', entry);
  }

  const root = document.querySelector('.lumina-one.one-v3');
  if (!root) return;

  const input = root.querySelector('.one-agora-page .one-region-input input');
  const status = root.querySelector('.one-v3-location-status.is-warn');
  const preferred = localStorage.getItem(REGION_KEY) || '';
  if (input && status && preferred && !input.value.trim() && status.textContent?.includes('Mantive')) {
    setReactInputValue(input, preferred);
  }

  root.querySelectorAll('.one-together-overlay[data-v3-kind="radar"]').forEach(overlay => {
    overlay.querySelector('.one-sync-controls')?.remove();
    overlay.querySelector('.one-sync-status')?.remove();
  });
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    stabilize();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
else schedule();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-v3-kind'] });
