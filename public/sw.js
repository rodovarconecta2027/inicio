/* RODOVAR CONECTA — Service Worker Oficial (PWA + Web Share Target + Atualização Controlada) */
const SW_VERSION = '2026.10.28-v3';
const CACHE_NAME = `rodovar-conecta-shell-${SW_VERSION}`;
const IDB_NAME = 'rodovar_shared_receipts_idb';
const IDB_VERSION = 1;
const IDB_SHARED_STORE = 'shared_receipts';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-512x512.png',
  '/assets/default-avatar.png',
];

function openSharedReceiptsDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_SHARED_STORE)) {
        db.createObjectStore(IDB_SHARED_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSharedPayloadToIdb(record) {
  const db = await openSharedReceiptsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_SHARED_STORE, 'readwrite');
    const store = tx.objectStore(IDB_SHARED_STORE);
    store.put(record);
    tx.oncomplete = () => resolve(record.id);
    tx.onerror = () => reject(tx.error);
  });
}

async function clearSharedPayloadsFromIdb() {
  try {
    const db = await openSharedReceiptsDb();
    await new Promise((resolve) => {
      const tx = db.transaction(IDB_SHARED_STORE, 'readwrite');
      const store = tx.objectStore(IDB_SHARED_STORE);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore IDB cleanup error
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(SHELL_ASSETS).catch(() => {
          // Ignore individual asset pre-cache failures in dev
        });
      } catch {
        // Ignore cache open failure
      }
      // Controlled update: only auto-activate on first install when no active controller exists.
      // When an active controller already exists, wait until the user clicks "Atualizar agora" (SKIP_WAITING).
      if (!self.registration.active) {
        await self.skipWaiting();
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'CLEAR_SENSITIVE_DATA') {
    event.waitUntil(clearSharedPayloadsFromIdb());
  } else if (data.type === 'GET_SW_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: SW_VERSION, cacheName: CACHE_NAME });
    }
  }
});

function isSensitiveOrAuthenticatedRequest(request, url) {
  if (request.method !== 'GET') return true;
  if (url.origin !== self.location.origin) return true;
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname.includes('comprovante') ||
    url.pathname.includes('pagamentos') ||
    url.pathname.includes('firestore.googleapis.com')
  ) {
    return true;
  }
  if (request.headers.get('Authorization')) {
    return true;
  }
  return false;
}

function isStaticShellAsset(url) {
  if (SHELL_ASSETS.includes(url.pathname)) return true;
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg')
  ) {
    // Never cache uploaded files or receipts
    if (url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/api/')) {
      return false;
    }
    return true;
  }
  return false;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Intercept Web Share Target POST /receber-comprovante
  if (
    event.request.method === 'POST' &&
    url.pathname === '/receber-comprovante' &&
    !url.searchParams.has('format')
  ) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const shareId = `swshare-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          const fileCandidate =
            formData.get('comprovante') ||
            formData.get('file') ||
            formData.get('files');

          const sharedTitle = String(formData.get('title') || '');
          const sharedText = String(formData.get('text') || '');
          const sharedUrl = String(formData.get('url') || '');

          if (
            fileCandidate &&
            typeof fileCandidate === 'object' &&
            'size' in fileCandidate &&
            fileCandidate.size > 0
          ) {
            const arrayBuffer = await fileCandidate.arrayBuffer();
            await saveSharedPayloadToIdb({
              id: shareId,
              createdAtIso: new Date().toISOString(),
              createdAtMs: Date.now(),
              textOnly: false,
              fileName: fileCandidate.name || 'comprovante_banco.pdf',
              mimeType: fileCandidate.type || 'application/pdf',
              sizeBytes: fileCandidate.size,
              arrayBuffer,
              sharedTitle,
              sharedText,
              sharedUrl,
            });
          } else {
            await saveSharedPayloadToIdb({
              id: shareId,
              createdAtIso: new Date().toISOString(),
              createdAtMs: Date.now(),
              textOnly: true,
              sharedTitle,
              sharedText,
              sharedUrl,
            });
          }

          return Response.redirect(
            `/receber-comprovante?shared=1&shareId=${encodeURIComponent(shareId)}`,
            303
          );
        } catch {
          return Response.redirect('/receber-comprovante?shared=1&error=sw_parse', 303);
        }
      })()
    );
    return;
  }

  // 2. Never cache authenticated responses, payment receipts, financial data, or /api/* endpoints
  if (isSensitiveOrAuthenticatedRequest(event.request, url)) {
    return;
  }

  // 3. Network-first for navigation requests (SPA deep links) with offline shell fallback (no white screen)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('/index.html');
          if (cachedIndex) return cachedIndex;
          const cachedRoot = await caches.match('/');
          return (
            cachedRoot ||
            new Response(
              '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RODOVAR CONECTA</title></head><body style="background:#080B0D;color:#FFD400;font-family:sans-serif;padding:24px;text-align:center;"><h2>Você está sem conexão. Algumas funções precisam de internet.</h2></body></html>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            )
          );
        })
    );
    return;
  }

  // 4. Stale-while-revalidate for static UI shell assets only (never private data)
  if (isStaticShellAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const networkFetch = fetch(event.request)
          .then((networkResponse) => {
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              networkResponse.type === 'basic'
            ) {
              const clone = networkResponse.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(event.request, clone))
                .catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || networkFetch;
      })
    );
  }
});
