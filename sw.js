// Κρατάει τα αρχεία του site για να ανοίγει γρήγορα και χωρίς internet.
// Αλλάζεις τον αριθμό σε κάθε νέα έκδοση ώστε να ανανεωθεί η cache.
const CACHE = 'fooddesk-v2';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.json', 'icons/icon.svg', 'data/foods.json', 'data/recipes.json', 'data/i18n.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google (Apps Script) και γραμματοσειρές: κατευθείαν
  // Πρώτα δίκτυο (για να φαίνονται οι αλλαγές), αλλιώς ό,τι υπάρχει στην cache.
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
