const CACHE = 'elif-pwa-v3';
const PRECACHE = [
  '/',
  '/HTML/index.html',
  '/HTML/student_login.html',
  '/HTML/portal_login.html',
  '/HTML/student-library.html',
  '/css/style.css',
  '/JS/mai.js',
  '/JS/pwa.js',
  '/manifest.json',
  '/images/BEDRCOK LOGO.JPG',
  '/images/icons/icon-192.png',
  '/images/icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') {
    e.respondWith(fetch(request));
    return;
  }
  const url = new URL(request.url);

  if (isApiRequest(url)) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  const destination = request.destination;
  if (destination === 'document' || destination === '') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/HTML/index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res && res.ok && (url.origin === location.origin || request.destination === 'script' || request.destination === 'style')) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return res;
      });
    })
  );
});
