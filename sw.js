// =============================================================================
// SKULL — Service Worker (offline-first)
// -----------------------------------------------------------------------------
// সব single-file assets (index.html, manifest, icon) cache করে রাখে। ফলে data
// ছাড়াও গেমটা খোলে। Online multiplayer-এর জন্য socket.io traffic intercept
// করা হয় না — সরাসরি network-এ যায়, data থাকলে কাজ করে, না থাকলে UI offline
// indicator দেখায়।
// =============================================================================

const CACHE = "skull-v1";
const ASSETS = ["./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // socket.io / websocket এড়িয়ে চলো — online play সরাসরি network ব্যবহার করবে
  if (url.pathname.startsWith("/socket.io/") || url.protocol === "ws:" || url.protocol === "wss:") {
    return;
  }

  // navigation: cache-first, network fallback, offline fallback to index.html
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((hit) =>
        hit || fetch(req).catch(() => caches.match("./index.html"))
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((resp) => {
        const copy = resp.clone();
        if (resp.ok) caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return resp;
      }).catch(() => new Response("offline", { status: 504 })),
    ),
  );
});
