/* ============================================================
   sw.js — çevrimdışı destek.

   Uygulama kabuğu (HTML/CSS/JS/ikon) kuruluşta önbelleğe alınır ve
   önce önbellekten sunulur; böylece internet yokken de kelime defteri
   ve çalışma modu açılır. Çeviri istekleri (Google, MyMemory, Datamuse)
   asla önbelleğe alınmaz — bayat çeviri göstermek yanıltıcı olur.
   ============================================================ */

const CACHE = "cevirim-kabuk-v4";

const SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/langs.js",
  "./js/api.js",
  "./js/check.js",
  "./js/storage.js",
  "./js/backup.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Eski sürümlerin önbelleklerini temizle
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Yalnızca kendi kaynağımız önbelleklenir; çeviri API'leri her zaman ağdan.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // Önbellekten ver, arka planda tazele (stale-while-revalidate)
        fetch(req)
          .then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          })
          .catch(() => {});
        return hit;
      }
      return fetch(req).catch(() => caches.match("./index.html"));
    })
  );
});
