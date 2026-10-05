// Baidoa Bedrock ICT Campus - Progressive Web App Service Worker
const CACHE_NAME = 'bedrock-campus-v3';
const STATIC_ASSETS = [
  '/HTML/index.html',
  '/HTML/portal_login.html',
  '/HTML/Student Results.html',
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

// Install Event - Force immediate activation
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Caching partial fail:', err);
      });
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

  // Network first for APIs
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(request);
      })
    );
    return;
  }

  // Cache first with network fallback for static files
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && !networkResponse.redirected) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && !networkResponse.redirected) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {
        if (request.destination === 'image') {
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="transparent"/></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
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
