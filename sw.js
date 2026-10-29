const CACHE = "kookapp-v3";
const FILES = ["./", "index.html", "app.js", "style.css", "icon.svg", "manifest.webmanifest"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).catch(() => caches.match(e.request)));
});
