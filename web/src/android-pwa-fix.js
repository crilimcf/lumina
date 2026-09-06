const isAndroid = /Android/i.test(navigator.userAgent);

if (isAndroid && !window.Capacitor?.isNativePlatform?.()) {
  const copy = {
    pt:{ device:'Android', blocked:'As notificações estão bloqueadas. Ativa-as nas definições do browser para receber chamadas.', retry:'Não foi possível ativar. Toca novamente para tentar.' },
    en:{ device:'Android', blocked:'Notifications are blocked. Enable them in the browser settings to receive calls.', retry:'Could not enable notifications. Tap again to retry.' },
    fr:{ device:'Android', blocked:'Les notifications sont bloquées. Active-les dans les réglages du navigateur pour recevoir les appels.', retry:'Impossible d’activer les notifications. Appuie à nouveau pour réessayer.' },
    es:{ device:'Android', blocked:'Las notificaciones están bloqueadas. Actívalas en los ajustes del navegador para recibir llamadas.', retry:'No se pudieron activar las notificaciones. Toca de nuevo para reintentar.' },
  };
  const lang = String(window.__luminaDeviceLanguage || navigator.language || 'en').toLowerCase().split(/[-_]/)[0];
  const text = copy[lang] || copy.en;
  const b64ToBytes = value => {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  };

  async function androidSnapshot() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return { supported:false, standalone:true, permission:'unsupported', subscribed:false };
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager?.getSubscription?.();
      return { supported:!!registration?.pushManager || 'PushManager' in window, standalone:true, permission:Notification.permission, subscribed:!!subscription };
    } catch {
      return { supported:true, standalone:true, permission:Notification.permission, subscribed:false };
    }
  }

  async function enableAndroidPush() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      window.dispatchEvent(new CustomEvent('lumina:push-error', { detail:{ reason:'permission', message:text.blocked } }));
      window.dispatchEvent(new CustomEvent('lumina:push-state'));
      return false;
    }
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache:'none' });
      await navigator.serviceWorker.ready;
      const manager = registration.pushManager;
      if (!manager) throw new Error('push-manager-unavailable');
      let subscription = await manager.getSubscription();
      if (!subscription) {
        const keyResponse = await fetch('/api/notifications/push/key', { credentials:'include', cache:'no-store' });
        if (!keyResponse.ok) throw new Error(`push-key-${keyResponse.status}`);
        const { publicKey } = await keyResponse.json();
        subscription = await manager.subscribe({ userVisibleOnly:true, applicationServerKey:b64ToBytes(publicKey) });
      }
      const save = await fetch('/api/notifications/push/subscribe', {
        method:'POST', credentials:'include', headers:{ 'content-type':'application/json' }, body:JSON.stringify(subscription.toJSON()),
      });
      if (!save.ok) throw new Error(`push-save-${save.status}`);
      sessionStorage.removeItem('lumina-push-later');
      window.dispatchEvent(new CustomEvent('lumina:push-state'));
      return true;
    } catch (error) {
      console.warn('[android-push]', error?.message || error);
      window.dispatchEvent(new CustomEvent('lumina:push-error', { detail:{ reason:'subscribe', message:text.retry } }));
      window.dispatchEvent(new CustomEvent('lumina:push-state'));
      return false;
    }
  }

  const installOverrides = () => {
    window.__luminaEnablePush = enableAndroidPush;
    window.__luminaPushSnapshot = androidSnapshot;
    window.dispatchEvent(new CustomEvent('lumina:push-state'));
  };
  installOverrides();
  window.addEventListener('load', () => setTimeout(installOverrides, 0), { once:true });
  setTimeout(installOverrides, 1200);

  const fixPlatformCopy = root => {
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue?.includes('neste iPhone')) node.nodeValue = node.nodeValue.replaceAll('neste iPhone', `neste ${text.device}`);
      if (node.nodeValue?.includes('sur cet iPhone')) node.nodeValue = node.nodeValue.replaceAll('sur cet iPhone', `sur cet ${text.device}`);
      if (node.nodeValue?.includes('on this iPhone')) node.nodeValue = node.nodeValue.replaceAll('on this iPhone', `on this ${text.device}`);
      if (node.nodeValue?.includes('en este iPhone')) node.nodeValue = node.nodeValue.replaceAll('en este iPhone', `en este ${text.device}`);
    }
  };
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) fixPlatformCopy(node);
  });
  if (document.body) { fixPlatformCopy(document.body); observer.observe(document.body, { childList:true, subtree:true }); }
  else window.addEventListener('DOMContentLoaded', () => { fixPlatformCopy(document.body); observer.observe(document.body, { childList:true, subtree:true }); }, { once:true });
}
