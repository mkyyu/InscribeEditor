const CACHE_NAME = "inscribe-pwa-v2";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/assets/css/app.css",
  "/assets/fonts/fonts.css",
  "/assets/vendor/codemirror/codemirror.min.css",
  "/assets/vendor/codemirror/eclipse.min.css",
  "/assets/vendor/pyodide/pyodide.js",
  "/assets/vendor/codemirror/codemirror.min.js",
  "/assets/vendor/codemirror/python.min.js",
  "/assets/favicon/favicon.svg",
  "/assets/favicon/favicon-96x96.png",
  "/assets/favicon/favicon.ico",
  "/assets/favicon/apple-touch-icon.png",
  "/assets/favicon/site.webmanifest",
  "/assets/favicon/web-app-manifest-192x192.png",
  "/assets/favicon/web-app-manifest-512x512.png",
  "/dist/main.js",
  "/dist/boot.js",
  "/dist/worker/pyodide-worker.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const ok = response && response.status === 200 && response.type === "basic";
        if (ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
