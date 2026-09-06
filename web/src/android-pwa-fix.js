const isAndroid = /Android/i.test(navigator.userAgent);

// Android web/PWA only needs platform-specific copy here.
// Push registration intentionally lives in main.jsx so there is a single source
// of truth for permission, subscription and UI state. The previous version of
// this file repeatedly overwrote __luminaEnablePush/__luminaPushSnapshot,
// creating a race with main.jsx and leaving the activation banner out of sync.
if (isAndroid && !window.Capacitor?.isNativePlatform?.()) {
  window.__luminaAndroidWeb = true;

  const copy = {
    pt: { device: 'Android' },
    en: { device: 'Android' },
    fr: { device: 'Android' },
    es: { device: 'Android' },
  };
  const lang = String(window.__luminaDeviceLanguage || navigator.language || 'en')
    .toLowerCase()
    .split(/[-_]/)[0];
  const text = copy[lang] || copy.en;

  const fixPlatformCopy = (root) => {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue?.includes('neste iPhone')) {
        node.nodeValue = node.nodeValue.replaceAll('neste iPhone', `neste ${text.device}`);
      }
      if (node.nodeValue?.includes('sur cet iPhone')) {
        node.nodeValue = node.nodeValue.replaceAll('sur cet iPhone', `sur cet ${text.device}`);
      }
      if (node.nodeValue?.includes('on this iPhone')) {
        node.nodeValue = node.nodeValue.replaceAll('on this iPhone', `on this ${text.device}`);
      }
      if (node.nodeValue?.includes('en este iPhone')) {
        node.nodeValue = node.nodeValue.replaceAll('en este iPhone', `en este ${text.device}`);
      }
    }
  };

  const startCopyObserver = () => {
    if (!document.body) return;
    fixPlatformCopy(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) fixPlatformCopy(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.body) startCopyObserver();
  else window.addEventListener('DOMContentLoaded', startCopyObserver, { once: true });
}
