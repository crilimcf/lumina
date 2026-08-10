import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ErrorBoundary } from './ui.jsx';
import './index.css';

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

  const clearLegacyCaches = async () => {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('lumina-')).map((key) => caches.delete(key)));
  };

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
        cache: 'no-store', credentials: 'same-origin', headers: { 'cache-control': 'no-cache' },
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
      // Uma falha de rede nunca bloqueia a utilização da app.
    } finally { checkingDeployment = false; }
  };

  // Dock inferior: esconde ao deslizar para baixo e reaparece ao deslizar para cima.
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
  const scrollTopFor = (target) => target === document || target === document.documentElement || target === document.body
    ? (window.scrollY || document.documentElement.scrollTop || 0)
    : Number(target?.scrollTop || 0);
  const handleAnyScroll = (event) => {
    const target = event.target === document ? document : event.target;
    if (!target) return;
    const current = scrollTopFor(target);
    const previous = scrollPositions.get(target) ?? current;
    scrollPositions.set(target, current);
    const delta = current - previous;
    if (current < 36) return setDockHidden(false);
    if (Math.abs(delta) < 3 || performance.now() - lastDockChange < 90) return;
    setDockHidden(delta > 0);
  };
  document.addEventListener('scroll', handleAnyScroll, true);
  window.addEventListener('scroll', handleAnyScroll, { passive:true });
  window.addEventListener('pageshow', () => setDockHidden(false));

  // Web Push standards-based. Em iOS o prompt só aparece numa web app instalada
  // no ecrã principal e é sempre iniciado por um toque explícito em "Ativar".
  // Safari 18.4+ expõe window.pushManager: essa subscrição sobrevive mesmo se o
  // Service Worker for removido pelo sistema, e é partilhada com o SW de raiz.
  const supportsPush = 'Notification' in window && (
    'pushManager' in window || ('serviceWorker' in navigator && 'PushManager' in window)
  );
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
  let pushBanner = null;
  let pushBusy = false;
  let pushConfigured = false;

  const b64ToBytes = (value) => {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (char) => char.charCodeAt(0));
  };

  const getRegistration = async () => {
    if (!('serviceWorker' in navigator)) return null;
    const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache:'none' });
    await navigator.serviceWorker.ready;
    return registration;
  };

  const getPushManager = (registration) => window.pushManager || registration?.pushManager || null;

  const registerPush = async ({ ask = false } = {}) => {
    if (!supportsPush || pushBusy) return false;
    pushBusy = true;
    try {
      const registration = await getRegistration().catch(() => null);
      const manager = getPushManager(registration);
      if (!manager) return false;
      let permission = Notification.permission;
      if (permission === 'default' && ask) permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;

      let subscription = await manager.getSubscription();
      if (!subscription) {
        const keyResponse = await fetch('/api/notifications/push/key', { credentials:'include', cache:'no-store' });
        if (!keyResponse.ok) return false;
        const { publicKey } = await keyResponse.json();
        subscription = await manager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToBytes(publicKey),
        });
      }
      const save = await fetch('/api/notifications/push/subscribe', {
        method:'POST', credentials:'include', headers:{ 'content-type':'application/json' },
        body:JSON.stringify(subscription.toJSON()),
      });
      if (!save.ok) return false;
      pushConfigured = true;
      pushBanner?.remove(); pushBanner = null;
      sessionStorage.removeItem('lumina-push-later');
      window.dispatchEvent(new CustomEvent('lumina:push-state'));
      return true;
    } catch (error) {
      console.debug('[push] subscrição', error?.message);
      return false;
    } finally { pushBusy = false; }
  };

  window.__luminaEnablePush = () => registerPush({ ask:true });
  window.__luminaPushSnapshot = async () => {
    if (!supportsPush) return { supported:false, standalone, permission:'unsupported', subscribed:false };
    try {
      const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/') : null;
      const manager = getPushManager(registration);
      const subscription = await manager?.getSubscription?.();
      return { supported:true, standalone, permission:Notification.permission, subscribed:!!subscription };
    } catch {
      return { supported:true, standalone, permission:Notification.permission, subscribed:false };
    }
  };

  // Usado no logout para não deixar um dispositivo partilhado associado à conta anterior.
  window.__luminaDisablePush = async () => {
    if (!supportsPush) return;
    try {
      const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/') : null;
      const manager = getPushManager(registration);
      const subscription = await manager?.getSubscription?.();
      if (subscription) {
        await fetch('/api/notifications/push/unsubscribe', {
          method:'POST', credentials:'include', headers:{ 'content-type':'application/json' },
          body:JSON.stringify({ endpoint:subscription.endpoint }),
        }).catch(() => null);
        await subscription.unsubscribe().catch(() => false);
      }
    } finally {
      pushConfigured = false;
      window.dispatchEvent(new CustomEvent('lumina:push-state'));
    }
  };

  const showPushBanner = () => {
    if (pushBanner || !supportsPush || Notification.permission !== 'default') return;
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent) && !standalone) return;
    const box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Ativar notificações Lumina');
    Object.assign(box.style, {
      position:'fixed', left:'14px', right:'14px', top:'calc(14px + env(safe-area-inset-top))',
      zIndex:'250', maxWidth:'470px', margin:'0 auto', padding:'14px', borderRadius:'22px',
      background:'rgba(20,18,42,.96)', color:'#fff', boxShadow:'0 16px 44px rgba(20,18,42,.32)',
      fontFamily:'Manrope,system-ui,sans-serif', display:'flex', gap:'12px', alignItems:'center',
    });
    box.innerHTML = '<div style="flex:1"><div style="font-weight:800;font-size:14px">Não percas mensagens nem chamadas</div><div style="font-size:11px;opacity:.72;margin-top:3px;line-height:1.35">Ativa as notificações da Lumina neste iPhone.</div></div>';
    const activate = document.createElement('button');
    activate.textContent = 'Ativar';
    Object.assign(activate.style, { border:0,borderRadius:'999px',padding:'10px 14px',fontWeight:'800',background:'#fff',color:'#14122A' });
    activate.addEventListener('click', async () => {
      activate.disabled = true; activate.textContent = 'A ativar…';
      const ok = await registerPush({ ask:true });
      if (!ok) {
        activate.disabled = false;
        activate.textContent = Notification.permission === 'denied' ? 'Bloqueadas' : 'Tentar';
      }
    });
    const later = document.createElement('button');
    later.textContent = '×'; later.setAttribute('aria-label', 'Agora não');
    Object.assign(later.style, { border:0,background:'transparent',color:'#fff',fontSize:'22px',padding:'4px' });
    later.addEventListener('click', () => {
      box.remove(); pushBanner = null; sessionStorage.setItem('lumina-push-later','1');
    });
    box.append(activate, later);
    document.body.appendChild(box); pushBanner = box;
  };

  const maybeSetupPush = async () => {
    if (!supportsPush || pushConfigured) return;
    await getRegistration().catch(() => null);
    const session = await fetch('/api/auth/me', { credentials:'include', cache:'no-store' }).catch(() => null);
    if (!session?.ok) return;
    if (Notification.permission === 'granted') await registerPush();
    else if (Notification.permission === 'default' && !sessionStorage.getItem('lumina-push-later')) showPushBanner();
  };

  window.addEventListener('load', () => {
    clearLegacyCaches().catch(() => {});
    checkForNewDeployment();
    if (supportsPush) setTimeout(() => maybeSetupPush().catch(() => {}), 900);
  }, { once:true });

  // Apanha logins feitos sem reload, mas deixa de consultar quando a subscrição está pronta.
  const pushProbe = supportsPush ? setInterval(() => {
    if (pushConfigured || Notification.permission === 'denied') return;
    const shouldProbe = Notification.permission === 'granted'
      || (Notification.permission === 'default' && !pushBanner && !sessionStorage.getItem('lumina-push-later'));
    if (shouldProbe) maybeSetupPush().catch(() => {});
  }, 15_000) : null;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      setDockHidden(false);
      checkForNewDeployment();
      if (supportsPush && !pushConfigured) maybeSetupPush().catch(() => {});
      window.dispatchEvent(new CustomEvent('lumina:push-state'));
    }
  });
  window.addEventListener('pageshow', checkForNewDeployment);
  window.addEventListener('focus', checkForNewDeployment);
  window.addEventListener('pagehide', () => { if (pushProbe && Notification.permission === 'denied') clearInterval(pushProbe); });
}
