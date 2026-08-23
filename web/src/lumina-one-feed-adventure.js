import './lumina-one-feed-adventure.css';
import { readCachedRadarLocation } from './radar-location.js';

const LAST_MODE_KEY = 'lumina-one-last-mode-v1';
const MODE_ORDER = ['pulse', 'lumes', 'capsules', 'agora'];
const PROMPT_ROTATE_MS = 4100;
const MODE_ROTATE_MS = 12300;
const SIGNAL_TTL_MS = 45000;

const MODES = {
  pulse: {
    label:'PULSO', title:'Sente o pulso agora', subtitle:'Pessoas e momentos da tua rede',
    prompts:['O teu ritmo agora', 'Algo novo para ti', 'Uma pessoa em destaque', 'Vê o que está a mexer', 'O momento pede luz'],
  },
  lumes: {
    label:'LUMES', title:'Acende novos Lumes', subtitle:'Momentos reais, vistos uma vez',
    prompts:['Um Lume para descobrir', 'Uma luz da tua rede', 'Alguém partilhou um momento', 'Abre uma nova ligação', 'Liga-te ao teu círculo'],
  },
  capsules: {
    label:'CÁPSULAS', title:'Abre uma Cápsula', subtitle:'Memórias guardadas para o momento certo',
    prompts:['Uma Cápsula para ti', 'Abre algo inesperado', 'Guarda uma memória', 'Uma história para mais tarde', 'Pequena surpresa do dia'],
  },
  agora: {
    label:'AGORA', title:'Afina o teu Agora', subtitle:'Contexto e preferências, sem misturar notícias',
    prompts:['Escolhe o teu contexto', 'Diz o que queres ver', 'Afina as tuas sugestões', 'Usa a localização do iPhone', 'A Lumina adapta-se a ti'],
  },
};

const liveEntries = new Set();
const timers = new WeakMap();
let signalCache = null;
let signalPromise = null;
let signalFetchedAt = 0;

function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
function isMode(value) { return MODE_ORDER.includes(value); }

function dayPart(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}
function modeForTime(part = dayPart()) {
  if (part === 'morning') return 'pulse';
  if (part === 'afternoon') return 'agora';
  if (part === 'evening') return 'lumes';
  return 'capsules';
}
function greetingForTime(part = dayPart()) {
  if (part === 'morning') return 'Bom dia';
  if (part === 'afternoon') return 'Boa tarde';
  if (part === 'evening') return 'Boa noite';
  return 'Para ti agora';
}
function randomIndex(length) {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] % length;
  }
  return Math.floor(Math.random() * length);
}

async function apiJSON(path) {
  const response = await fetch(`/api${path}`, { credentials:'include', cache:'no-store', headers:{ Accept:'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadSignals(force = false) {
  const now = Date.now();
  if (!force && signalCache && now - signalFetchedAt < SIGNAL_TTL_MS) return signalCache;
  if (signalPromise) return signalPromise;

  signalPromise = Promise.allSettled([
    apiJSON('/one/preferences'), apiJSON('/one/capsules'), apiJSON('/one/lumes'),
  ]).then(results => {
    const value = index => results[index]?.status === 'fulfilled' ? results[index].value : null;
    const preferences = value(0) || {};
    const capsules = Array.isArray(value(1)) ? value(1) : [];
    const lumes = Array.isArray(value(2)) ? value(2) : [];
    const device = readCachedRadarLocation();
    const region = String(device?.label || device?.city || preferences.local_region || '').trim().slice(0, 100);
    signalCache = {
      region,
      capsules:capsules.length,
      lockedCapsules:capsules.filter(item => item?.locked).length,
      lumes:lumes.filter(item => !item?.mine && !item?.viewed).length,
    };
    signalFetchedAt = Date.now();
    return signalCache;
  }).finally(() => { signalPromise = null; });
  return signalPromise;
}

function preferredMode(signals = {}) {
  const remembered = storageGet(LAST_MODE_KEY);
  if (isMode(remembered)) return remembered;
  if (signals.lumes > 0) return 'lumes';
  if (signals.capsules > 0) return 'capsules';
  if (signals.region) return 'agora';
  return modeForTime();
}

function clearStatus(status) { while (status?.firstChild) status.firstChild.remove(); }
function appendStatus(status, icon, label, value = '') {
  clearStatus(status);
  const mark = document.createElement('i'); mark.setAttribute('aria-hidden', 'true'); mark.textContent = icon; status.append(mark);
  if (value !== '') {
    const strong = document.createElement('strong'); strong.dataset.i18nIgnore = 'true'; strong.textContent = String(value); status.append(strong);
  }
  const copy = document.createElement('span'); copy.textContent = label; status.append(copy);
}

function renderStatus(entry) {
  const status = entry.querySelector('[data-one-adventure-status]');
  if (!status) return;
  const signals = entry._oneAdventureSignals || {};
  const mode = entry.dataset.oneAdventureMode || 'pulse';
  if (mode === 'pulse') return appendStatus(status, '✦', greetingForTime(entry.dataset.oneAdventureDaypart));
  if (mode === 'lumes') return signals.lumes > 0
    ? appendStatus(status, '✦', 'Lumes para ver', signals.lumes)
    : appendStatus(status, '✦', 'Uma ligação pode surpreender-te');
  if (mode === 'capsules') return signals.capsules > 0
    ? appendStatus(status, '◫', 'Cápsulas contigo', signals.capsules)
    : appendStatus(status, '◫', 'Guarda algo para abrir depois');
  if (signals.region) appendStatus(status, '⌖', 'Agora em', signals.region);
  else appendStatus(status, '⌖', 'Localização pelo iPhone');
}

function setPrompt(entry, index, immediate = false) {
  const mode = entry.dataset.oneAdventureMode || 'pulse';
  const config = MODES[mode] || MODES.pulse;
  const prompt = entry.querySelector('[data-one-adventure-prompt]');
  const dots = [...entry.querySelectorAll('[data-one-adventure-dot]')];
  if (!prompt) return;
  const normalized = ((index % config.prompts.length) + config.prompts.length) % config.prompts.length;
  const apply = () => {
    prompt.textContent = config.prompts[normalized];
    entry.dataset.oneAdventurePrompt = String(normalized);
    dots.forEach((dot, dotIndex) => dot.classList.toggle('is-on', dotIndex === normalized % dots.length));
    entry.classList.remove('is-swapping');
  };
  if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
  entry.classList.add('is-swapping');
  setTimeout(() => { if (entry.isConnected) apply(); }, 170);
}

function setMode(entry, mode, { immediate = false } = {}) {
  if (!isMode(mode)) mode = 'pulse';
  const config = MODES[mode];
  const title = entry.querySelector('[data-one-adventure-title]');
  const subtitle = entry.querySelector('[data-one-adventure-subtitle]');
  const label = entry.querySelector('[data-one-adventure-mode-label]');
  const changed = entry.dataset.oneAdventureMode && entry.dataset.oneAdventureMode !== mode;
  const apply = () => {
    entry.dataset.oneAdventureMode = mode;
    if (title) title.textContent = config.title;
    if (subtitle) subtitle.textContent = config.subtitle;
    if (label) label.textContent = config.label;
    setPrompt(entry, randomIndex(config.prompts.length), true);
    renderStatus(entry);
    entry.classList.remove('is-mode-swapping');
  };
  if (changed && !immediate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    entry.classList.add('is-mode-swapping');
    setTimeout(() => { if (entry.isConnected) apply(); }, 190);
  } else apply();
}

function pauseRotation(entry, milliseconds = 7000) { entry._oneAdventurePausedUntil = Date.now() + milliseconds; }
function stopRotation(entry) {
  const active = timers.get(entry);
  if (active) active.forEach(timer => window.clearInterval(timer));
  timers.delete(entry); liveEntries.delete(entry);
}
function startRotation(entry) {
  if (timers.has(entry) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const promptTimer = window.setInterval(() => {
    if (!entry.isConnected) return stopRotation(entry);
    if (document.hidden || Date.now() < (entry._oneAdventurePausedUntil || 0)) return;
    setPrompt(entry, Number(entry.dataset.oneAdventurePrompt || 0) + 1);
  }, PROMPT_ROTATE_MS);
  const modeTimer = window.setInterval(() => {
    if (!entry.isConnected) return stopRotation(entry);
    if (document.hidden || Date.now() < (entry._oneAdventurePausedUntil || 0)) return;
    const current = MODE_ORDER.indexOf(entry.dataset.oneAdventureMode || 'pulse');
    setMode(entry, MODE_ORDER[(current + 1) % MODE_ORDER.length]);
    if (Date.now() - signalFetchedAt > SIGNAL_TTL_MS) void refreshSignals(false);
  }, MODE_ROTATE_MS);
  timers.set(entry, [promptTimer, modeTimer]);
}

function openCurrentMode(entry) {
  const mode = entry.dataset.oneAdventureMode || 'pulse';
  storageSet(LAST_MODE_KEY, mode);
  pauseRotation(entry, 12000);
  const targetIndex = MODE_ORDER.indexOf(mode);
  let attempts = 0;
  const focus = () => {
    const buttons = [...document.querySelectorAll('.lumina-one .one-tabs button')];
    if (buttons[targetIndex]) {
      if (!buttons[targetIndex].classList.contains('is-on')) buttons[targetIndex].click();
      return;
    }
    if (++attempts < 22) window.setTimeout(focus, 70);
  };
  window.setTimeout(focus, 35);
}

function enhance(entry) {
  if (!(entry instanceof HTMLButtonElement) || entry.dataset.oneAdventureEnhanced === '1') return;
  entry.dataset.oneAdventureEnhanced = '1';
  entry.classList.add('one-adventure-entry');
  entry.setAttribute('aria-label', 'Abrir Lumina One');
  entry.dataset.oneAdventureDaypart = dayPart();
  entry.innerHTML = `
    <span class="one-adventure-orbit" aria-hidden="true"><span class="one-adventure-orbit-ring"></span><span class="one-adventure-orbit-star">✦</span></span>
    <span class="one-adventure-copy">
      <small>LUMINA ONE <i>·</i> <span data-one-adventure-mode-label>PULSO</span></small>
      <b data-one-adventure-title>Sente o pulso agora</b>
      <em data-one-adventure-subtitle>Pessoas e momentos da tua rede</em>
      <span class="one-adventure-prompt-line"><span class="one-adventure-prompt-pill"><i aria-hidden="true">✦</i><span data-one-adventure-prompt>O teu ritmo agora</span></span><span class="one-adventure-dots" aria-hidden="true"><i data-one-adventure-dot></i><i data-one-adventure-dot></i><i data-one-adventure-dot></i></span></span>
      <span class="one-adventure-status" data-one-adventure-status></span>
    </span>
    <span class="one-adventure-flow" aria-hidden="true">↗</span>
    <span class="one-adventure-portal" aria-hidden="true"><span class="one-adventure-portal-glow"></span><span class="one-adventure-symbol one-adventure-symbol-pulse"><i></i><b></b></span><span class="one-adventure-symbol one-adventure-symbol-lumes"><i></i><b></b><em></em></span><span class="one-adventure-symbol one-adventure-symbol-capsules"><i></i></span><span class="one-adventure-symbol one-adventure-symbol-agora"><i></i><b></b></span></span>`;

  document.documentElement.classList.add('one-adventure-active');
  liveEntries.add(entry);
  setMode(entry, isMode(storageGet(LAST_MODE_KEY)) ? storageGet(LAST_MODE_KEY) : modeForTime(), { immediate:true });
  startRotation(entry);
  entry.addEventListener('pointerdown', () => pauseRotation(entry), { passive:true });
  entry.addEventListener('click', () => openCurrentMode(entry), { capture:true });
  loadSignals().then(signals => {
    if (!entry.isConnected) return;
    entry._oneAdventureSignals = signals;
    entry.dataset.oneAdventurePersonalized = '1';
    setMode(entry, preferredMode(signals), { immediate:true });
  }).catch(() => {});
}

async function refreshSignals(force = true) {
  const signals = await loadSignals(force).catch(() => null);
  if (!signals) return;
  for (const entry of [...liveEntries]) {
    if (!entry.isConnected) { stopRotation(entry); continue; }
    entry._oneAdventureSignals = signals;
    entry.dataset.oneAdventurePersonalized = '1';
    renderStatus(entry);
  }
}

function scan(root = document) {
  root.querySelectorAll?.('.one-v3-feed-entry').forEach(enhance);
  if (root instanceof Element && root.matches('.one-v3-feed-entry')) enhance(root);
}
function rememberOneTab(event) {
  const button = event.target?.closest?.('.lumina-one .one-tabs button');
  if (!button) return;
  const buttons = [...button.parentElement.querySelectorAll('button')];
  const mode = MODE_ORDER[buttons.indexOf(button)];
  if (!mode) return;
  storageSet(LAST_MODE_KEY, mode);
  for (const entry of liveEntries) if (entry.isConnected) setMode(entry, mode, { immediate:true });
}

function start() {
  scan(document);
  document.addEventListener('click', rememberOneTab, { capture:true });
  window.addEventListener('focus', () => { for (const entry of liveEntries) { entry.dataset.oneAdventureDaypart = dayPart(); renderStatus(entry); } void refreshSignals(false); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshSignals(false); });
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) scan(node);
  }).observe(document.documentElement, { childList:true, subtree:true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
else start();
