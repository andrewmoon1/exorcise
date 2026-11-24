// Service worker: keeps a copy of every app file so the app works offline.
// Bump CACHE when any file changes, so phones fetch the new version.

const CACHE = 'exorcise-v5';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/main.js',
  './js/domain/model.js',
  './js/domain/dates.js',
  './js/domain/history.js',
  './js/domain/rotation.js',
  './js/domain/plan.js',
  './js/domain/sets.js',
  './js/domain/progress.js',
  './js/storage/store.js',
  './js/storage/idb-store.js',
  './js/storage/memory-store.js',
  './js/storage/migrations.js',
  './js/actions/app-service.js',
  './js/seed/seed-data.js',
  './js/seed/dumbbell-variations.js',
  './js/seed/old-history.js',
  './js/seed/workouts-history.js',
  './js/ui/dom.js',
  './js/ui/components.js',
  './js/ui/today-view.js',
  './js/ui/history-view.js',
  './js/ui/charts.js',
  './js/ui/settings-view.js',
  './js/ui/rest-timer.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never stores old files.
  const requests = FILES.map((f) => new Request(f, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first: instant start and full offline use.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
