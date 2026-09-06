(() => {
  const locales = { pt:'pt-PT', en:'en-US', fr:'fr-FR', es:'es-ES' };
  const descriptions = {
    pt:'Feed, Salas, Momentos e conversas num só espaço para a tua rede.',
    en:'Feed, Rooms, Moments and conversations in one place for your network.',
    fr:'Fil, Salons, Moments et conversations réunis dans un seul espace pour ton réseau.',
    es:'Feed, Salas, Momentos y conversaciones en un solo espacio para tu red.',
  };

  const candidates = [...(Array.isArray(navigator.languages) ? navigator.languages : []), navigator.language].filter(Boolean);
  const language = candidates
    .map(value => String(value).toLowerCase().split(/[-_]/)[0])
    .find(value => locales[value]) || 'en';

  document.documentElement.lang = locales[language];
  document.querySelector('meta[name="description"]')?.setAttribute('content', descriptions[language]);
  window.__luminaDeviceLanguage = language;

  const manifest = document.getElementById('lumina-manifest');
  if (manifest) manifest.href = `/manifest-${language}.webmanifest?v=2026-09-06e`;

  const secureEnough = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || !secureEnough) return;

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope:'/',
        updateViaCache:'none',
      });
      await navigator.serviceWorker.ready;
      window.__luminaPwaServiceWorkerReady = true;
      window.dispatchEvent(new CustomEvent('lumina:pwa-ready', { detail:{ registration } }));
    } catch (error) {
      window.__luminaPwaServiceWorkerReady = false;
      window.dispatchEvent(new CustomEvent('lumina:pwa-error', {
        detail:{ message:String(error?.message || error || 'service_worker_failed') },
      }));
      console.warn('[pwa-install] service worker registration failed', error?.message || error);
    }
  };

  if (document.readyState === 'complete') void registerServiceWorker();
  else window.addEventListener('load', () => { void registerServiceWorker(); }, { once:true });
})();
