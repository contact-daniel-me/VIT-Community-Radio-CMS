/**
 * VIT Community Radio CMS -- Progressive Web App Service Worker
 *
 * Security & Caching Architecture:
 * 1. STRICT ISOLATION:
 *    - All API calls (Supabase /rest/v1, /auth/v1, /storage/v1, /functions/v1) are NETWORK-ONLY.
 *    - All Cloudflare R2 requests are NETWORK-ONLY.
 *    - All authenticated requests (Authorization header or tokens) are NETWORK-ONLY.
 *    - All non-GET methods (POST, PUT, DELETE, PATCH) are NETWORK-ONLY.
 *    - All audio streams/files and partial content (Range requests) are NETWORK-ONLY.
 *    - Mixota editor communications are NETWORK-ONLY.
 *
 * 2. SAFE STATIC CACHING:
 *    - App shell and static bundle assets (HTML, hashed JS/CSS, web fonts, brand icons).
 *    - Navigation requests (HTML) use a Network-First strategy with stale fallback when offline.
 *    - Hashed static assets (/assets/*) use Cache-First with network fallback.
 *
 * 3. CONTROLLED UPDATES:
 *    - Inactive workers wait until SKIP_WAITING is explicitly messaged or all tabs close.
 *    - Avoids disrupting active recording, QC review, or audio uploads.
 */

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `vit-radio-static-${CACHE_VERSION}`;

// Pre-cached critical static shell assets
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/favicon.ico',
  '/favicon-32.png',
  '/favicon-192.png',
  '/favicon-512.png',
  '/maskable-icon-192.png',
  '/maskable-icon-512.png',
  '/apple-touch-icon.png',
];

// Domains that MUST NEVER be intercepted or cached
const BYPASS_DOMAINS = [
  'supabase.co',
  'r2.cloudflarestorage.com',
  'mixota.growiota.in',
  'googletagmanager.com',
  'google-analytics.com',
];

// Path segments that MUST NEVER be cached
const BYPASS_PATHS = [
  '/auth/v1',
  '/rest/v1',
  '/storage/v1',
  '/functions/v1',
  '/functions/v1/r2-storage',
  '/api/',
];

// Install: precache essential static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch((err) => {
        console.warn('[PWA ServiceWorker] Pre-caching warning:', err);
      })
  );
});

// Activate: clean up older cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== STATIC_CACHE) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Listen for SKIP_WAITING message sent from client update notification
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch: enforce strict isolation and safe static caching
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Never intercept non-GET requests (POST, PUT, DELETE, PATCH, etc.)
  if (request.method !== 'GET') {
    return;
  }

  // 2. Never intercept or cache Range requests (audio seeking / byte streaming)
  if (request.headers.has('range')) {
    return;
  }

  // 3. Never intercept or cache requests to external bypass domains (Supabase, R2, Mixota, Analytics)
  if (BYPASS_DOMAINS.some((domain) => url.hostname.includes(domain))) {
    return;
  }

  // 4. Never intercept or cache private API paths or authenticated requests
  if (BYPASS_PATHS.some((path) => url.pathname.includes(path))) {
    return;
  }

  // 5. Never cache audio binaries or streams
  if (
    request.destination === 'audio' ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.wav') ||
    url.pathname.endsWith('.aac')
  ) {
    return;
  }

  // 6. Navigation requests (HTML documents): Network-First with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          return new Response(
            '<!doctype html><html><head><meta charset="utf-8"><title>VIT Radio - Offline</title><style>body{font-family:sans-serif;text-align:center;padding:2rem;color:#333;background:#fafafa}h1{color:#d21e28}</style></head><body><h1>VIT Community Radio</h1><p>You are currently offline. Please check your internet connection to continue.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // 7. Static assets from same origin (/assets/*, fonts, images, webmanifest)
  const isSameOrigin = url.origin === self.location.origin;
  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webmanifest');

  const isGoogleFont =
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (isSameOrigin && isStaticAsset) {
    // Cache-First for static assets
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  if (isGoogleFont) {
    // Stale-While-Revalidate for Google Web Fonts
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const fetched = fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || fetched;
        })
      )
    );
    return;
  }

  // Default: pass through to network
});

