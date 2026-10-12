// Baidoa Bedrock ICT Campus - Progressive Web App Service Worker
const CACHE_NAME = 'bedrock-campus-v7';
const STATIC_ASSETS = [
  '/HTML/index.html',
  '/HTML/portal_login.html',
  '/HTML/Student Results.html',
  '/HTML/Student%20Results.html',
  '/HTML/teacher-dashboard.html',
  '/HTML/parent_dashboard.html',
  '/HTML/library.html',
  '/JS/pwa.js',
  '/JS/pre-app-news.js',
  '/JS/push-subscribe.js',
  '/images/icons/icon-192.png',
  '/images/icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap'
];

// Install Event - Force immediate activation and cache assets safely
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return Promise.allSettled(
        STATIC_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('[SW] Could not precache asset:', asset, err.message);
          })
        )
      );
    })
  );
});

// Activate Event - Claim clients immediately and purge old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cache);
              return caches.delete(cache);
            }
          })
        );
      })
    ])
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }

  // 1. API Requests Handling
  // Homepage public read-only content can be served network-first with safe JSON cache fallback
  const isHomepagePublicApi =
    url.pathname === '/api/content' ||
    url.pathname.startsWith('/api/announcements/latest') ||
    url.pathname === '/api/testimonials';

  if (isHomepagePublicApi) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          // Safe fallback response: NEVER return undefined to event.respondWith!
          const fallbackData = url.pathname === '/api/content' ? {} : [];
          return new Response(JSON.stringify(fallbackData), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        })
    );
    return;
  }

  // ALL other API calls: bypass service worker completely so browser performs native network fetch
  if (url.pathname.startsWith('/api/') || request.url.includes('/api/')) {
    return;
  }

  // 2. HTML navigation & document requests (Network-First)
  const isHtml = request.mode === 'navigate' ||
                 request.destination === 'document' ||
                 request.url.includes('.html') ||
                 (request.headers.get('accept') && request.headers.get('accept').includes('text/html'));

  if (isHtml) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && !networkResponse.redirected) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/HTML/index.html');
          if (fallback) return fallback;
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Offline | Bedrock ICT Campus</title></head><body style="font-family:sans-serif;text-align:center;padding:40px;"><h2>You are offline</h2><p>Please check your internet connection and reload.</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // 3. Static Assets (Cache-first with network fallback)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && !networkResponse.redirected) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse)).catch(() => {});
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && !networkResponse.redirected) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => {
          if (request.destination === 'image') {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="transparent"/></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }
          return new Response('', { status: 404 });
        });
    })
  );
});

// --- WEB PUSH NOTIFICATIONS (Background Screen & Lock Screen Alerts) ---
self.addEventListener('push', (event) => {
  console.log('[SW Push] Background push event received!');
  let payload = {
    title: 'Baidoa Bedrock ICT Campus',
    body: 'New announcement or urgent campus notice available!',
    icon: '/images/icons/icon-192.png',
    badge: '/images/icons/icon-192.png',
    url: '/HTML/index.html'
  };

  if (event.data) {
    try {
      const data = event.data.json();
      payload = { ...payload, ...data };
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  // Construct absolute URLs so icons resolve properly when browser/app is closed
  const origin = self.location.origin;
  const iconUrl = payload.icon && payload.icon.startsWith('http') ? payload.icon : origin + (payload.icon || '/images/icons/icon-192.png');
  const badgeUrl = payload.badge && payload.badge.startsWith('http') ? payload.badge : origin + (payload.badge || '/images/icons/icon-192.png');
  const targetUrl = payload.url && payload.url.startsWith('http') ? payload.url : origin + (payload.url || '/HTML/index.html');

  const options = {
    body: payload.body || 'Tap to view new campus update.',
    icon: iconUrl,
    badge: badgeUrl,
    vibrate: [300, 100, 300, 100, 300], // Vibration pattern like WhatsApp
    tag: 'bedrock-campus-push-' + Date.now(),
    renotify: true,
    requireInteraction: true, // Remains visible on lock screen until user taps
    data: { url: targetUrl },
    actions: [
      { action: 'open', title: '📲 Open Message' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Baidoa Bedrock ICT Campus', options)
      .catch((err) => {
        console.warn('[SW Push] Rich notification error, attempting fallback:', err);
        // Fallback options without actions/image if OS rejects rich options
        return self.registration.showNotification(payload.title || 'Baidoa Bedrock ICT Campus', {
          body: payload.body || 'Tap to open announcement.',
          icon: iconUrl,
          data: { url: targetUrl }
        });
      })
  );
});

// Notification Click Listener
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || (self.location.origin + '/HTML/index.html');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
