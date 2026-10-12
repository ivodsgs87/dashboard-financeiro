// Service worker da app.
// - Ficheiros da pasta /assets/ (têm um código no nome que muda a cada atualização):
//   vêm logo da memória do telemóvel/computador, sem esperar pela internet.
// - Tudo o resto (a página em si, o manifest): tenta primeiro a internet, para
//   apanhar sempre a versão mais recente, e só usa a memória se estiver offline.
const CACHE_PAGINAS = 'dashboard-financeiro-v2';
const CACHE_ASSETS = 'dashboard-financeiro-assets-v1';
const MAX_ASSETS = 40;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_PAGINAS)
      .then((cache) => Promise.all(['/', '/manifest.json'].map((u) => cache.add(u).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) => Promise.all(
      nomes.filter((n) => n !== CACHE_PAGINAS && n !== CACHE_ASSETS).map((n) => caches.delete(n))
    ))
  );
  self.clients.claim();
});

// Guarda no máximo MAX_ASSETS ficheiros (apaga os mais antigos de versões passadas)
const arrumar = async () => {
  const cache = await caches.open(CACHE_ASSETS);
  const chaves = await cache.keys();
  for (let i = 0; i < chaves.length - MAX_ASSETS; i++) await cache.delete(chaves[i]);
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase e APIs externas: nunca passam pelo service worker
  if (url.origin !== self.location.origin) return;
  if (url.href.includes('firebase') || url.href.includes('googleapis') || url.href.includes('google.com')) return;

  // Ficheiros com código no nome: memória primeiro
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE_ASSETS).then((cache) => cache.match(req).then((guardado) => {
        if (guardado) return guardado;
        return fetch(req).then((resp) => {
          if (resp && resp.status === 200) {
            cache.put(req, resp.clone()).then(arrumar).catch(() => {});
          }
          return resp;
        });
      }))
    );
    return;
  }

  // Resto: internet primeiro, memória se estiver offline
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.status === 200) {
          const copia = resp.clone();
          caches.open(CACHE_PAGINAS).then((cache) => cache.put(req, copia)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req).then((guardado) => {
        if (guardado) return guardado;
        if (req.mode === 'navigate') return caches.match('/');
      }))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
