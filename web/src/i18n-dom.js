import { locale, t } from './i18n.js';

document.documentElement.lang = locale;
const originals = new WeakMap();
const attributeOriginals = new WeakMap();
const skip = '.post-body,.post-copy,.comment-body,.message-body,.message-text,.room-message-body,[contenteditable="true"]';

function apply(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest(skip) || !node.data.trim()) continue;
    if (!originals.has(node)) originals.set(node, node.data);
    const source = originals.get(node);
    const clean = source.trim();
    const next = t(clean);
    if (next !== clean) node.data = source.replace(clean, next);
  }

  root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(el => {
    if (!attributeOriginals.has(el)) attributeOriginals.set(el, {});
    const original = attributeOriginals.get(el);
    for (const name of ['placeholder','aria-label','title']) {
      if (!el.hasAttribute(name)) continue;
      if (!(name in original)) original[name] = el.getAttribute(name);
      const source = original[name];
      const next = t(source);
      if (next !== source) el.setAttribute(name, next);
    }
  });
}

const start = () => {
  apply(document.body);
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType === 1) apply(node);
  }))).observe(document.body, { childList:true, subtree:true });
};

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', start, { once:true })
  : start();
