// Minimal service worker: makes the app installable and caches the shell.
const CACHE = "sliplab-v1";
const SHELL = ["/", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
});

// Network-first for API calls (always fresh data), cache-first for the shell.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // never cache live data
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
