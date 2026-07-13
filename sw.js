// ============================================================
// Octano Retaguarda / Monitor — Service Worker (PWA)
// ------------------------------------------------------------
// NETWORK-FIRST: online sempre pega a versão nova (nunca trava em cache velho);
// o cache serve só como reserva quando estiver OFFLINE. Cacheia apenas a "casca"
// do app (mesmo domínio) — Supabase e APIs externas nunca são cacheadas.
// Existe pra o app ser INSTALÁVEL (quiosque no celular) sem quebrar os deploys.
// ============================================================
const CACHE = "octano-monitor-v1";

self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    fetch(req)
      .then((resp) => {
        try {
          if (new URL(req.url).origin === self.location.origin) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
        } catch (_) {}
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
