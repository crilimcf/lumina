/* Lumina push-only service worker.
 * Não intercepta fetches nem guarda o shell em CacheStorage: os assets continuam
 * a ser versionados pelo Vite e o HTML mantém no-store. O worker existe apenas
 * para Web Push/notifications e limpa qualquer cache legado ao ativar.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('lumina-')).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function syncAppBadge(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return;
  try {
    if (count > 0 && 'setAppBadge' in self.navigator) await self.navigator.setAppBadge(Math.min(999, Math.floor(count)));
    else if (count <= 0 && 'clearAppBadge' in self.navigator) await self.navigator.clearAppBadge();
  } catch {}
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    // iOS 18.4+ consegue apresentar este formato declarativamente mesmo se o
    // Service Worker falhar. Browsers antigos chegam aqui e apresentamos a mesma
    // notificação por JavaScript, mantendo compatibilidade.
    let direct = null;
    try { direct = event.data?.json?.() || null; } catch {}

    let notification = null;
  let badgeCount = null;
  if (direct?.web_push === 8030 && direct?.notification?.title) {
    badgeCount = Number(direct.app_badge);
    notification = {
        title: direct.notification.title,
        body: direct.notification.body || '',
        tag: direct.notification.tag || 'lumina:activity',
        url: direct.notification.navigate || '/?tab=alerts',
        type: String(direct.notification.tag || '').startsWith('lumina:call:') ? 'incoming_call' : 'activity',
      };
    }

    // Compatibilidade com pushes vazios já em trânsito ou subscrições antigas.
    if (!notification) {
      try {
        const response = await fetch('/api/notifications/push/latest', {
          credentials: 'include',
          cache: 'no-store',
          headers: { 'cache-control': 'no-cache' },
        });      if (response.ok) {
      const payload = await response.json();
      notification = payload?.notification || null;
      badgeCount = Number(payload?.unread);
    }
      } catch {}
    }

    notification ||= {
      title: 'Lumina',
      body: 'Tens uma novidade.',
      tag: 'lumina:activity',
      url: '/?tab=alerts',
      type: 'activity',
    };

    await Promise.all([
    syncAppBadge(badgeCount),
    self.registration.showNotification(notification.title || 'Lumina', {
      body: notification.body,
      tag: notification.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: notification.url || '/?tab=alerts' },
      renotify: true,
      silent: false,
      requireInteraction: notification.type === 'incoming_call',
    }),
  ]);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/?tab=alerts', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    for (const client of windows) {
      if ('navigate' in client) await client.navigate(target).catch(() => null);
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : null;
  })());
});
