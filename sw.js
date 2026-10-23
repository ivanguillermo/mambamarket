// Sube este número cada vez que publiques cambios grandes (limpia cachés viejas)
const CACHE_NAME = "mamba-market-v2";

// Archivos del "esqueleto" de la app. Se cachean uno por uno: si uno falla
// (por ejemplo productos.csv no existe) los demás igual se guardan.
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./mambamarket.css",
  "./mambamarket.js",
  "./config.js",
  "./manifest.json",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => console.warn("[SW] No se pudo cachear:", url, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Nunca interceptar la API de Apps Script / Google / Firebase: siempre datos frescos
  if (/(script\.google\.com|script\.googleusercontent\.com|googleapis\.com|firebase|gstatic\.com\/firebasejs)/.test(url.hostname + url.pathname)) {
    return;
  }

  // Librerías externas estáticas (Font Awesome y sus fuentes): caché primero
  if (url.hostname === "cdnjs.cloudflare.com") {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copia = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copia));
        return res;
      }))
    );
    return;
  }

  // Archivos propios (html, js, css, imágenes): RED PRIMERO, caché solo si no hay conexión.
  // Así cada vez que publiques cambios en GitHub Pages el cliente los recibe.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => {
            if (cached) return cached;
            if (req.mode === "navigate") return caches.match("./index.html");
            return new Response("", { status: 504, statusText: "Sin conexión" });
          })
        )
    );
  }
});

// Interceptar peticiones para servir desde la caché si falla la red
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => {
        // Fallback genérico o de navegación si es necesario
      });
    })
  );
});
