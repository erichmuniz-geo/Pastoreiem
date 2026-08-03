const CACHE = "pastoreio-v4-referencias-citadas-20260803";

const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/style.css",
  "./assets/app.js",
  "./assets/data.js",
  "./assets/cover.webp",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./data/book.json",
  "./data/refs.json",
  "./data/cited_refs.json",
  "./data/letters.json",
  "./documentos/Pastoreiem_o_Rebanho_de_Deus_2025.pdf",
  "./documentos/Caderno_STFG_Referencias.pdf",
  "./documentos/Indice_Cruzado_Referencias_Citadas.pdf",
  "./documentos/Referencia_no_Texto_original.pdf",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request)
          .then((response) => {
            if (response.ok && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(event.request, copy));
            }
            return response;
          })
          .catch(() => caches.match("./index.html")),
    ),
  );
});
