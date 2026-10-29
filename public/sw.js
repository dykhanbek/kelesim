// Kelisim service worker: makes the app installable and keeps the shell available offline.
// API calls are never cached (always fresh data); hashed /assets/* files are cached forever.
const SHELL = "kelisim-shell-v2";
const ASSETS = "kelisim-assets-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/logo.svg", "/logo-dark.svg", "/icon-192.png", "/manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // Hashed build assets: cache-first
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(caches.open(ASSETS).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => (r.ok && c.put(e.request, r.clone()), r))));
    return;
  }
  // Page navigations: network-first, offline fallback to the cached app shell
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => { caches.open(SHELL).then((c) => c.put("/", r.clone())); return r; })
        .catch(() => caches.match("/")),
    );
  }
});
