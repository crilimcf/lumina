/**
 * Service worker da Lumina.
 *
 * Cache mínimo, sem tentar adivinhar nomes de ficheiros com hash do build:
 * guarda o essencial no install, e depois cache-first para `/assets/*`
 * (nomes com hash do Vite — seguros para guardar para sempre) e
 * network-first para a navegação, com o shell como rede de segurança offline.
 *
 * Pedidos para a API (`/api/*`) passam sempre direto à rede: nunca é
 * seguro guardar em cache uma resposta autenticada num dispositivo
 * partilhado. Isto é sobre o caminho, não sobre a origem — `/api/*` é
 * reencaminhado pela Vercel para a Railway, por isso já é a mesma origem
 * do resto da app; um filtro por origem deixava de identificar estes
 * pedidos e passava a confiar só em não haver nenhum outro ramo abaixo
 * que lhes desse `respondWith` — verdade hoje, frágil para sempre.
 */
const CACHE = 'lumina-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return; // API: sempre direto à rede

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      }))
    );
  }
});
