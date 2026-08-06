const CACHE = "fourteen-shell-v2";
const SHELL = ["/", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    return new Response("You’re offline. Fourteen will be here when you’re back.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }));
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(self.registration.showNotification(data.title || "Fourteen", { body: data.body || "Something real is waiting.", icon: "/icon-192.png", badge: "/icon-192.png", tag: data.tag, data: { url: data.url || "/home" } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const path = event.notification.data?.url || "/home";
    const existing = clients.find((client) => "focus" in client);
    if (existing) {
      existing.navigate(path);
      return existing.focus();
    }
    return self.clients.openWindow(path);
  }));
});
