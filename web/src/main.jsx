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

  /**
   * Assinatura do deployment atualmente carregado.
   *
   * A build do Vite coloca hashes nos nomes do JS/CSS. Comparar os assets do
   * HTML que esta janela carregou com os assets do HTML que a Vercel serve
   * agora permite detetar um deployment novo sem service worker, versão
   * manual ou dependência de caches do Safari.
   */
  const deploymentSignature = (doc) => Array.from(doc.querySelectorAll(
    'script[type="module"][src*="/assets/"], link[rel="stylesheet"][href*="/assets/"]'
  ))
    .map((node) => node.getAttribute('src') || node.getAttribute('href'))
    .filter(Boolean)
    .sort()
    .join('|');

  const loadedDeployment = deploymentSignature(document);
  let checkingDeployment = false;
  let reloadingForDeployment = false;

  const checkForNewDeployment = async () => {
    if (checkingDeployment || reloadingForDeployment || !loadedDeployment) return;
    checkingDeployment = true;

    try {
      const url = new URL('/', window.location.origin);
      url.searchParams.set('__lumina_update_check', Date.now().toString());

      const response = await fetch(url, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'cache-control': 'no-cache' },
      });
      if (!response.ok) return;

      const html = await response.text();
      const latestDocument = new DOMParser().parseFromString(html, 'text/html');
      const latestDeployment = deploymentSignature(latestDocument);

      if (latestDeployment && latestDeployment !== loadedDeployment) {
        reloadingForDeployment = true;
        window.location.reload();
      }
    } catch {
      // Uma falha de rede nunca deve impedir a app de continuar a funcionar.
      // Voltamos a verificar naturalmente no próximo foreground/pageshow.
    } finally {
      checkingDeployment = false;
    }
  };

  /**
   * Dock inferior: esconde ao deslizar para baixo e reaparece imediatamente ao
   * deslizar para cima. O listener usa capture porque vários ecrãs (Feed,
   * Radar, Salas, listas) podem ter o seu próprio contentor de scroll no iOS.
   */
  const scrollPositions = new WeakMap();
  let dockHidden = false;
  let lastDockChange = 0;
  const setDockHidden = (hidden) => {
    if (hidden === dockHidden) return;
    dockHidden = hidden;
    lastDockChange = performance.now();
    const dock = document.querySelector('.nav');
    if (!dock) return;
    dock.style.transition = 'transform .24s cubic-bezier(.2,.8,.2,1), opacity .2s ease';
    dock.style.transform = hidden ? 'translate3d(0, calc(100% + 34px), 0)' : 'translate3d(0,0,0)';
    dock.style.opacity = hidden ? '0' : '1';
    dock.style.pointerEvents = hidden ? 'none' : 'auto';
  };

  const scrollTopFor = (target) => {
    if (target === document || target === document.documentElement || target === document.body) {
      return window.scrollY || document.documentElement.scrollTop || 0;
    }
    return Number(target?.scrollTop || 0);
  };

  const handleAnyScroll = (event) => {
    const target = event.target === document ? document : event.target;
    if (!target) return;
    const current = scrollTopFor(target);
    const previous = scrollPositions.get(target) ?? current;
    scrollPositions.set(target, current);
    const delta = current - previous;

    if (current < 36) {
      setDockHidden(false);
      return;
    }
    if (Math.abs(delta) < 3) return;
    if (performance.now() - lastDockChange < 90) return;
    if (delta > 0) setDockHidden(true);
    else setDockHidden(false);
  };

  document.addEventListener('scroll', handleAnyScroll, true);
  window.addEventListener('scroll', handleAnyScroll, { passive:true });
  window.addEventListener('pageshow', () => setDockHidden(false));

  window.addEventListener('load', () => {
    retireLegacyPwaState().catch(() => {});
    checkForNewDeployment();
  }, { once: true });

  // iOS pode recuperar uma PWA instalada da memória em vez de fazer uma nova
  // navegação. Ao voltar à Lumina, verificamos sempre a produção antes de o
  // utilizador continuar numa versão antiga.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      setDockHidden(false);
      checkForNewDeployment();
    }
  });
  window.addEventListener('pageshow', checkForNewDeployment);
  window.addEventListener('focus', checkForNewDeployment);
}
