/* =====================================================
 * Service Worker — Planning Atelier Narbonne
 * Stratégie : Network-first pour les données, Cache-first pour le shell
 * ===================================================== */

const CACHE_VERSION = 'planning-v1.0.1';
const CACHE_NAME = `planning-cache-${CACHE_VERSION}`;

// Fichiers à mettre en cache pour fonctionnement offline (le "shell" de l'app)
const SHELL_FILES = [
  '/Planning-Web/',
  '/Planning-Web/index.html',
  '/Planning-Web/manifest.json',
  '/Planning-Web/icons/icon-192.png',
  '/Planning-Web/icons/icon-512.png'
];

// Domaines à NE JAMAIS mettre en cache (toujours réseau)
const NEVER_CACHE_DOMAINS = [
  'sheets.googleapis.com',
  'oauth2.googleapis.com',
  'accounts.google.com',
  'www.googleapis.com'
];

// =====================================================
// INSTALLATION : pré-remplir le cache du shell
// =====================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Install', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())  // active immédiatement la nouvelle version
      .catch((err) => console.error('[SW] Install error:', err))
  );
});

// =====================================================
// ACTIVATION : nettoyer les anciens caches
// =====================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('planning-cache-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())  // contrôle les pages déjà ouvertes
  );
});

// =====================================================
// FETCH : stratégie selon le type de requête
// =====================================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ne jamais intercepter les API Google (toujours réseau direct)
  if (NEVER_CACHE_DOMAINS.some(d => url.hostname.includes(d))) {
    return;  // laisser le navigateur gérer normalement
  }

  // Pour les fichiers du shell : Cache-first puis réseau si absent
  // Pour le reste : Network-first avec fallback cache
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Si en cache, on renvoie le cache mais on met à jour en arrière-plan
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // Mettre à jour le cache si la réponse est OK et même origine
          if (networkResponse.ok && url.origin === self.location.origin) {
            const cloned = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);  // si offline, retourner le cache

      return cachedResponse || fetchPromise;
    })
  );
});
