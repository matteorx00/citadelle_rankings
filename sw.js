/* =========================================================
   CITADELLES RANKINGS — service worker
   Rôle : rendre l'application installable et permettre son
   ouverture immédiate. Les données restent toujours en ligne,
   seules les ressources de l'interface sont mises en cache.
   Incrémentez CACHE_VERSION à chaque mise en ligne d'une
   nouvelle version de index.html ou app.js.
   ========================================================= */

const CACHE_VERSION = "cr-v3";

const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Les appels à Supabase ne sont jamais mis en cache
  if (url.hostname.endsWith("supabase.co")) return;

  // Réseau d'abord, cache en secours.
  // On garde ainsi toujours la dernière version du code en ligne
  // tout en permettant l'ouverture sans connexion.
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
  );
});
