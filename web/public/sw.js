// Service worker del portal: que el pase del visitante se vea sin señal una vez abierto.
// - Páginas: primero la red; sin conexión, la última copia del portal (es una SPA).
// - Archivos del portal (assets con hash, fuentes, íconos): copia local primero.
// - Datos: solo GET /api/solicitudes/ACC-…, primero la red y sin conexión la última copia.
// Nada del panel interno (assets/int/, /api/operador, /api/control, /api/auth) se guarda.
const VERSION = 'v1';
const ESTATICO = `accesos-estatico-${VERSION}`;
const DATOS = `accesos-datos-${VERSION}`;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(ESTATICO).then((c) => c.addAll(['/', '/favicon.svg', '/tema.js'])));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.endsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function redPrimero(req, cache, clave = req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(cache)).put(clave, res.clone());
    return res;
  } catch (err) {
    const copia = await caches.match(clave);
    if (copia) return copia;
    throw err;
  }
}

async function copiaPrimero(req) {
  const copia = await caches.match(req);
  if (copia) return copia;
  const res = await fetch(req);
  if (res.ok) (await caches.open(ESTATICO)).put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (/^\/api\/solicitudes\/ACC-\d{4}-\d{6}$/.test(url.pathname)) e.respondWith(redPrimero(req, DATOS));
    return;
  }
  if (url.pathname.startsWith('/assets/int/')) return;
  // Todas las rutas del portal sirven el mismo index.html: se guarda una sola copia.
  if (req.mode === 'navigate') { e.respondWith(redPrimero(req, ESTATICO, '/')); return; }
  if (/^\/assets\//.test(url.pathname) || /\.(?:woff2?|svg|png|jpe?g|webp)$/.test(url.pathname) || url.pathname === '/tema.js') {
    e.respondWith(copiaPrimero(req));
  }
});
