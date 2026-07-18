// Precaches the app shell so the client app opens and runs offline; the
// offline change-queue in app.js then holds any edits until the connection
// returns. Bump CACHE to force clients onto a new shell after a deploy.
const CACHE = 'coachsbc-client-v2';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './web-client-api.js',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache the workspace API — it's dynamic and per-client. Let it hit
  // the network; app.js queues writes itself when the network is down.
  if (url.pathname.includes('/api/')) return;

  // Stale-while-revalidate: serve the cached shell instantly, refresh it in
  // the background so the next open picks up any deploy.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || cache.match('./index.html');
  })());
});
