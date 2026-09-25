/* Tick It offline support: keeps a copy of the app on the device so it opens without internet.
   Your lists aren't stored here; they live in the browser's own storage. */
const CACHE = 'ticklist-v6'; // storage names keep the old 'ticklist' prefix so nothing saved is lost
const CORE = ['./', 'manifest.webmanifest', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('ticklist-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const put = (req, res) => caches.open(CACHE).then(c => c.put(req, res));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The page itself: try the network first so updates arrive, but don't keep people waiting on a bad connection.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = caches.match('./');
      const network = fetch(req).then(res => { if (res.ok) put('./', res.clone()); return res; });
      const slow = new Promise(r => setTimeout(r, 3000)).then(() => cached);
      try {
        return (await Promise.race([network, slow])) || await network;
      } catch {
        return (await cached) || Response.error();
      }
    })());
    return;
  }

  // Icons, manifest and fonts: use the saved copy, refreshing it in the background.
  const ours = url.origin === self.location.origin && url.pathname.startsWith(new URL('./', self.location).pathname);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!ours && !fonts) return;
  e.respondWith(caches.match(req).then(hit => {
    const refresh = fetch(req).then(res => { if (res.ok || res.type === 'opaque') put(req, res.clone()); return res; });
    if (hit) { refresh.catch(() => {}); return hit; }
    return refresh;
  }));
});
