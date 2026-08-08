/**
 * Service worker da Lumina.
 *
 * O placeholder BUILD é substituído pelo Vite em cada build de produção.
 * Assim cada deployment cria um cache próprio e o iPhone deixa de ficar preso
 * a um shell antigo da PWA.
 */
const BUILD = '__LUMINA_BUILD__';
const CACHE = `lumina-${BUILD}`;
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((path) => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const legacyV2 = keys.includes('lumina-v2');
    await Promise.all(keys.filter((key) => key.startsWith('lumina-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();

    // Migração única para quem ainda tem o service worker antigo. Esse código
    // antigo não sabia ouvir `controllerchange`, por isso forçamos uma única
    // navegação quando encontramos especificamente o cache lumina-v2.
    if (legacyV2) {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => null)));
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Assets do Vite têm hash no nome. Cache-first é seguro porque uma alteração
  // de código gera outro URL e nunca reutiliza bytes antigos pelo mesmo nome.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      }))
    );
  }
});
