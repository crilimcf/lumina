import { locale, translateDynamic } from './i18n.js';

document.documentElement.lang = locale;

const textState = new WeakMap();
const attributeState = new WeakMap();
const attributes = ['placeholder', 'aria-label', 'title'];
const skipSelector = [
  '[data-i18n-ignore="true"]',
  '.post-body',
  '.post-copy',
  '.comment-body',
  '.message-body',
  '.message-text',
  '.message-bubble',
  '.room-message-body',
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
  return `${before}${translateDynamic(clean)}${after}`;
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
  const next = translateDynamic(entry.source);
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
