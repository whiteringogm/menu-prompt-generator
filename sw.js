const CACHE = 'menu-prompt-generator-v5.1.13';
const STOCK_CONTROLS = './stock-buttons.js?v=521';
const STOCK_UI = './stock-ui.js?v=512';
const PLAN_ORDER = './plan-order.js?v=513';
const ASSETS = ['./', './index.html', './plan-sync.js?v=517', STOCK_CONTROLS, STOCK_UI, PLAN_ORDER, './app.js?v=510', './yesterday-ui.js?v=513', './pantry-export.js?v=514', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function pageWithStockControls(request) {
  let response = await caches.match(request) || await caches.match('./index.html');

  try {
    const fresh = await fetch(request);
    if (fresh?.ok) {
      response = fresh;
      const cache = await caches.open(CACHE);
      cache.put(request, fresh.clone());
    }
  } catch {
    // Use the cached page while offline.
  }

  if (!response) return Response.error();
  let html = await response.text();
  html = html.replace(/v5\.1\.\d+/g, 'v5.1.13');

  const scripts = [
    ['stock-buttons.js', STOCK_CONTROLS],
    ['stock-ui.js', STOCK_UI],
    ['plan-order.js', PLAN_ORDER],
  ];
  const missingScripts = scripts
    .filter(([name]) => !html.includes(name))
    .map(([, source]) => `<script src="${source}"></script>`)
    .join('\n');
  if (missingScripts) html = html.replace('</body>', `${missingScripts}\n</body>`);

  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isPage = event.request.mode === 'navigate'
    || (url.origin === self.location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')));

  if (isPage) {
    event.respondWith(pageWithStockControls(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
