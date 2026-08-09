import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ErrorBoundary } from './ui.jsx';
import './index.css';

/**
 * A PWA instalada fica presa à origem (scheme + host + port) onde foi criada.
 * Por isso a Lumina tem UMA origem canónica para utilizadores. Previews e
 * aliases de branches nunca devem tornar-se outra "Lumina" no Home Screen.
 *
 * QA continua possível em previews acrescentando ?preview=1 ao URL.
 */
const CANONICAL_HOST = 'lumina-snowy-ten.vercel.app';
const host = window.location.hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1';
const isVercelAlias = host.endsWith('.vercel.app');
const previewBypass = new URLSearchParams(window.location.search).get('preview') === '1';

if (!isLocal && isVercelAlias && host !== CANONICAL_HOST && !previewBypass) {
  const canonical = new URL(window.location.href);
  canonical.protocol = 'https:';
  canonical.host = CANONICAL_HOST;
  canonical.searchParams.delete('preview');
  window.location.replace(canonical.toString());
} else {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary><App /></ErrorBoundary>
    </React.StrictMode>
  );

  /**
   * Retira o service worker/cache customizado antigo.
   *
   * Nesta fase da Lumina, consistência de deploy é mais importante do que um
   * shell offline. O HTML já é no-store e os assets do Vite têm hash, por isso
   * o browser pode usar o seu cache HTTP normal sem manter uma segunda versão
   * da aplicação escondida num CacheStorage controlado por nós.
   */
  const retireLegacyPwaState = async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('lumina-')).map((key) => caches.delete(key))
      );
    }
  };

  window.addEventListener('load', () => {
    retireLegacyPwaState().catch(() => {});
  }, { once: true });
}
