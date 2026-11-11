const CACHE = "kookapp-v7";
const FILES = ["./", "index.html", "cloud.js?v=3", "app.js?v=5", "sync.js?v=3", "style.css", "icon.svg?v=3", "manifest.webmanifest"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));

self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("kookapp-") && key !== CACHE).map((key) => caches.delete(key))))
));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).catch(() => caches.match(e.request)));
});
