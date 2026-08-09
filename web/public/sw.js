/**
 * Service worker de migração da Lumina.
 *
 * As primeiras instalações usavam CacheStorage para guardar o shell da app.
 * Isso tornou possível uma instalação antiga continuar a arrancar um frontend
 * que já não correspondia à produção. Este worker existe apenas para retirar
 * esses workers/caches quando uma instalação antiga pedir /sw.js outra vez.
 *
 * Não intercepta pedidos e desregista-se a si próprio depois da ativação.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith('lumina-')).map((key) => caches.delete(key))
    );

    await self.registration.unregister();

    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    await Promise.all(
      windows.map((client) => client.navigate(client.url).catch(() => null))
    );
  })());
});
