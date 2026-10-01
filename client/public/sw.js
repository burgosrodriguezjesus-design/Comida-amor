// Service worker de Comida Amor: abre la app sin conexión y muestra los recordatorios.
// Nunca guarda en caché datos personales (/api): solo los archivos de la aplicación.

const CACHE = 'comida-amor-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/theme-init.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Navegación: primero la red; sin conexión, la app guardada.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Archivos con huella (/assets/…): caché primero.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Comida Amor';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '¿Has registrado lo que acabas de comer?',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag || 'comida-amor',
      renotify: false,
      data: { url: data.url || '/' },
      actions: [{ action: 'registrar', title: 'Registrar ahora' }],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.action === 'registrar' ? '/?nuevo=rapido' : (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
