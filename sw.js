// ============================================================
// Octano Retaguarda / Monitor — Service Worker (PWA)
// ------------------------------------------------------------
// NETWORK-FIRST: online sempre pega a versão nova (nunca trava em cache velho);
// o cache serve só como reserva quando estiver OFFLINE. Cacheia apenas a "casca"
// do app (mesmo domínio) — Supabase e APIs externas nunca são cacheadas.
// Existe pra o app ser INSTALÁVEL (quiosque no celular) sem quebrar os deploys.
// ============================================================
const CACHE = "octano-monitor-v2";

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

// ============================================================
// WEB PUSH — alerta chega como notificação do sistema, igual app.
// Quem dispara é o sentinela (sentinela_sonda.py) via VAPID.
// ============================================================
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { corpo: e.data && e.data.text() }; }
  const titulo = d.titulo || "Octano";
  const opcoes = {
    body: d.corpo || "",
    tag: d.tag || "octano",          // mesma tag substitui, não empilha repetido
    renotify: true,
    requireInteraction: !!d.grave,   // alerta grave fica na tela até tocar
    data: { url: d.url || "./" },
    // vibração curta-longa-curta: dá pra sentir no bolso sem olhar
    vibrate: d.grave ? [200, 100, 200, 100, 400] : [150],
  };
  e.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ("focus" in c) { c.navigate(destino); return c.focus(); }
      }
      return clients.openWindow(destino);
    })
  );
});
