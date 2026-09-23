/* Vinilo · Service Worker
   - App shell: cache-first (funciona sin conexión).
   - Fuentes de Google: stale-while-revalidate.
   - Audio: la primera vez va a la red y se guarda completo en segundo plano;
     después se sirve desde caché (incluidas las peticiones Range).
   Al cambiar cualquier archivo del shell, sube la versión de CACHE. */
const CACHE = 'vinilo-shell-v5';
const AUDIO = 'vinilo-audio-v1';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './tracks.js',
  './player.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];
const filling = new Set();

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== AUDIO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function audioResponse(e) {
  const req = e.request, url = req.url;
  const cache = await caches.open(AUDIO);
  const hit = await cache.match(url);
  if (!hit) {
    if (!filling.has(url)) {                       // descarga completa en segundo plano
      filling.add(url);
      e.waitUntil(
        fetch(url).then((r) => { if (r.ok) return cache.put(url, r); }).catch(() => {}).finally(() => filling.delete(url))
      );
    }
    return fetch(req);
  }
  const range = req.headers.get('range');
  if (!range) return hit;
  const buf = await hit.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const start = m[1] ? +m[1] : 0;
  const end = m[2] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Audio propio
  if (url.origin === location.origin && (req.destination === 'audio' || url.pathname.includes('/audio/'))) {
    e.respondWith(audioResponse(e));
    return;
  }
  if (req.headers.has('range')) return;

  // Fuentes de Google
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const net = fetch(req).then((res) => { cache.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Navegación: red primero; sin conexión, el shell
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // Resto de archivos propios: cache-first
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
