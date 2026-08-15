import './lumina-one-feed-adventure.css';

const PROMPTS = [
  'Surpresa do dia',
  'Hoje perto de ti',
  'Uma ideia para explorar',
  'Vê o que está a mexer',
  'Experimenta algo diferente',
];
const ROTATE_MS = 5200;
const timers = new WeakMap();

function randomIndex(length) {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] % length;
  }
  return Math.floor(Math.random() * length);
}

function setPrompt(entry, index, immediate = false) {
  const prompt = entry.querySelector('[data-one-adventure-prompt]');
  const dots = [...entry.querySelectorAll('[data-one-adventure-dot]')];
  if (!prompt) return;

  const apply = () => {
    prompt.textContent = PROMPTS[index];
    entry.dataset.oneAdventurePrompt = String(index);
    dots.forEach((dot, dotIndex) => dot.classList.toggle('is-on', dotIndex === (index % dots.length)));
    entry.classList.remove('is-swapping');
  };

  if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply();
    return;
  }

  entry.classList.add('is-swapping');
  setTimeout(() => {
    if (entry.isConnected) apply();
  }, 170);
}

function startRotation(entry) {
  if (timers.has(entry)) return;
  let index = randomIndex(PROMPTS.length);
  setPrompt(entry, index, true);

  const timer = window.setInterval(() => {
    if (!entry.isConnected) {
      window.clearInterval(timer);
      timers.delete(entry);
      return;
    }
    if (document.hidden) return;
    index = (index + 1) % PROMPTS.length;
    setPrompt(entry, index);
  }, ROTATE_MS);
  timers.set(entry, timer);
}

function enhance(entry) {
  if (!(entry instanceof HTMLButtonElement) || entry.dataset.oneAdventureEnhanced === '1') return;
  entry.dataset.oneAdventureEnhanced = '1';
  entry.classList.add('one-adventure-entry');
  entry.setAttribute('aria-label', 'Abrir Lumina One');
  entry.innerHTML = `
    <span class="one-adventure-orbit" aria-hidden="true">
      <span class="one-adventure-orbit-ring"></span>
      <span class="one-adventure-orbit-star">✦</span>
    </span>
    <span class="one-adventure-copy">
      <small>LUMINA ONE</small>
      <b>Descobrir agora</b>
      <em>Pulso · Lumes · Cápsulas · Juntos</em>
      <span class="one-adventure-prompt-line">
        <span class="one-adventure-prompt-pill"><i aria-hidden="true">✦</i><span data-one-adventure-prompt>Surpresa do dia</span></span>
        <span class="one-adventure-dots" aria-hidden="true">
          <i data-one-adventure-dot></i><i data-one-adventure-dot></i><i data-one-adventure-dot></i>
        </span>
      </span>
    </span>
    <span class="one-adventure-flow" aria-hidden="true">↗</span>
    <span class="one-adventure-portal" aria-hidden="true">
      <span class="one-adventure-portal-glow"></span>
      <span class="one-adventure-planet"><i></i><b></b><em></em></span>
    </span>`;

  document.documentElement.classList.add('one-adventure-active');
  startRotation(entry);
}

function scan(root = document) {
  root.querySelectorAll?.('.one-v3-feed-entry').forEach(enhance);
  if (root instanceof Element && root.matches('.one-v3-feed-entry')) enhance(root);
}

function start() {
  scan(document);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      }
    }
  });
  observer.observe(document.body, { childList:true, subtree:true });
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', start, { once:true })
  : start();
