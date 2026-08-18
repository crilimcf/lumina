import { language, locale, translateDynamic } from './i18n.js';
import { EN_MISC, FR_MISC, ES_MISC } from './locales/misc-extra.js';
import { EN_DEVICE, FR_DEVICE, ES_DEVICE, translateDeviceDynamic } from './locales/device-extra.js';

document.documentElement.lang = locale;

const textState = new WeakMap();
const attributeState = new WeakMap();
const attributes = ['placeholder', 'aria-label', 'title'];
const miscCatalogs = {
  en:{ ...EN_MISC, ...EN_DEVICE },
  fr:{ ...FR_MISC, ...FR_DEVICE },
  es:{ ...ES_MISC, ...ES_DEVICE },
};
const normalizeKey = value => String(value ?? '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-PT');
const normalizedMisc = Object.fromEntries(Object.entries(miscCatalogs).map(([lang, catalog]) => [
  lang,
  new Map(Object.entries(catalog).map(([key, value]) => [normalizeKey(key), value])),
]));

function preserveLabelCase(input, value) {
  const trimmed = String(input ?? '').trim();
  const hasLetters = /\p{L}/u.test(trimmed);
  const uppercase = hasLetters
    && trimmed === trimmed.toLocaleUpperCase('pt-PT')
    && trimmed !== trimmed.toLocaleLowerCase('pt-PT');
  return uppercase ? String(value).toLocaleUpperCase(locale) : value;
}

function translateSurface(source) {
  const input = String(source ?? '');
  if (language === 'pt') return input;

  // The device catalogue is the last-mile correction layer for UI authored by
  // runtime scripts. Resolve exact strings first so partial DOM fragments never
  // leave a mixed-language surface behind.
  const override = miscCatalogs[language]?.[input] ?? normalizedMisc[language]?.get(normalizeKey(input));
  if (override !== undefined) return preserveLabelCase(input, override);

  const deviceDynamic = translateDeviceDynamic(input, language);
  if (deviceDynamic !== input) return deviceDynamic;

  const translated = translateDynamic(input);
  return translated !== input ? translated : input;
}

// These surfaces are authored by users or external publishers. UI chrome around them is
// translated, but their actual content must stay exactly in the language it was published.
const skipSelector = [
  '[data-i18n-ignore="true"]',
  '.post-body',
  '.post-copy',
  '.lumina-post-copy',
  '.comment-body',
  '.message-body',
  '.message-text',
  '.message-bubble',
  '.room-message-body',
  '.lumina-profile-name',
  '.lumina-profile-handle',
  '.lumina-profile-bio',
  '.public-profile-name',
  '.public-profile-handle',
  '.public-profile-bio',
  '.public-profile-post-copy',
  '.activity-profile-name',
  '.activity-profile-handle',
  '.activity-profile-bio',
  '.activity-profile-post-body',
  '.explore-card h2',
  '.explore-card h3',
  '.explore-card-summary',
  '.explore-source-name',
  '.room-card .d',
  '.one-pulse-copy > p',
  '.one-local-grid article > b',
  '.one-local-grid article > p',
  '.one-v3-discovery-copy h3',
  '.one-v3-discovery-copy p',
  '.one-together-caption p',
  '.one-together-radar h3',
  '.one-together-radar p',
  '[contenteditable="true"]',
].join(',');

function isSkipped(element) {
  return !element || Boolean(element.closest?.(skipSelector));
}

function translatedPreservingWhitespace(source) {
  const match = String(source).match(/^(\s*)([\s\S]*?)(\s*)$/u);
  if (!match) return source;
  const [, before, clean, after] = match;
  if (!clean.trim()) return source;
  return `${before}${translateSurface(clean)}${after}`;
}

function applyText(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE || isSkipped(node.parentElement)) return;

  const current = node.data;
  let state = textState.get(node);
  if (!state) {
    state = { source:current, rendered:null };
    textState.set(node, state);
  } else if (current !== state.rendered && current !== state.source) {
    state.source = current;
  }

  const next = translatedPreservingWhitespace(state.source);
  state.rendered = next;
  if (node.data !== next) node.data = next;
}

function applyAttribute(element, name) {
  if (!(element instanceof Element) || isSkipped(element) || !element.hasAttribute(name)) return;

  let state = attributeState.get(element);
  if (!state) {
    state = {};
    attributeState.set(element, state);
  }

  const current = element.getAttribute(name) ?? '';
  const previous = state[name];
  if (!previous) {
    state[name] = { source:current, rendered:null };
  } else if (current !== previous.rendered && current !== previous.source) {
    previous.source = current;
  }

  const entry = state[name];
  const next = translateSurface(entry.source);
  entry.rendered = next;
  if (current !== next) element.setAttribute(name, next);
}

function applyElement(element) {
  if (!(element instanceof Element) || isSkipped(element)) return;
  for (const name of attributes) applyAttribute(element, name);
  element.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(child => {
    for (const name of attributes) applyAttribute(child, name);
  });

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) applyText(node);
}

function apply(node = document.body) {
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) applyText(node);
  else if (node.nodeType === Node.ELEMENT_NODE) applyElement(node);
}

const start = () => {
  apply(document.body);

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') {
        applyText(record.target);
        continue;
      }
      if (record.type === 'attributes') {
        applyAttribute(record.target, record.attributeName);
        continue;
      }
      for (const node of record.addedNodes) apply(node);
    }
  });

  observer.observe(document.body, {
    childList:true,
    subtree:true,
    characterData:true,
    attributes:true,
    attributeFilter:attributes,
  });
};

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', start, { once:true })
  : start();