const CACHE = "fourteen-shell-v1";
const SHELL = ["/", "/home", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
  event.waitUntil(self.registration.showNotification(data.title || "Fourteen", { body: data.body || "Something happened.", icon: "/icon.svg", data: { url: data.url || "/home" } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/home"));
});
