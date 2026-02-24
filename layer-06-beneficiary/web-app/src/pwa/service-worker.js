/**
 * AnnaSetu — Service Worker (PWA)
 * Offline support: cache API responses, queue redemptions
 */

const CACHE_NAME = 'annasetu-v1.0';
const STATIC_ASSETS = [
  '/', '/index.html', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png',
];

const API_CACHE_PATTERNS = [
  '/api/identity/bpl-eligibility/',
  '/api/erupi/vouchers/',
  '/api/identity/nfsa/districts',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch Strategy ────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Static assets: Cache First
  if (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // API calls: Network First with cache fallback
  if (API_CACHE_PATTERNS.some(p => url.pathname.startsWith(p)) && event.request.method === 'GET') {
    event.respondWith(networkFirstWithCache(event.request));
    return;
  }

  // POST redemptions: queue if offline
  if (event.request.method === 'POST' && url.pathname.includes('/redeem')) {
    event.respondWith(postWithOfflineQueue(event.request));
    return;
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  return cached || fetch(request);
}

async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    const cache    = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline', cached: false }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function postWithOfflineQueue(request) {
  try {
    return await fetch(request);
  } catch {
    // Queue for sync when online
    const body = await request.json();
    const queue = await getOfflineQueue();
    queue.push({ url: request.url, body, ts: Date.now() });
    await saveOfflineQueue(queue);

    return new Response(JSON.stringify({ queued: true, offline: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Background Sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-redemptions') {
    event.waitUntil(syncOfflineRedemptions());
  }
});

async function syncOfflineRedemptions() {
  const queue = await getOfflineQueue();
  const remaining = [];
  for (const item of queue) {
    try {
      await fetch(item.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      });
    } catch {
      remaining.push(item);
    }
  }
  await saveOfflineQueue(remaining);
  if (remaining.length < queue.length) {
    self.registration.showNotification('AnnaSetu', {
      body: `${queue.length - remaining.length} voucher redemptions synced`,
      icon: '/icons/icon-192.png',
    });
  }
}

async function getOfflineQueue() {
  // Use IndexedDB in production; for simplicity use cache store
  const cache = await caches.open(CACHE_NAME);
  const r = await cache.match('/offline-queue');
  return r ? r.json() : [];
}

async function saveOfflineQueue(queue) {
  const cache = await caches.open(CACHE_NAME);
  cache.put('/offline-queue', new Response(JSON.stringify(queue)));
}

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'AnnaSetu', {
      body:  data.body  || 'You have a new voucher!',
      icon:  '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data:  data,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/vouchers'));
});
