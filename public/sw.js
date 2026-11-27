// Service worker for notifications only. It handles no fetches and caches
// nothing, so the app still loads fresh from the network on every visit.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// A message from the server, e.g. "Hân báo đã chuyển 45.000đ".
self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(message.title || "Tiền cầu lông", {
        body: message.body || "",
        icon: "/icon-192.png",
        data: { url: message.url || "/" },
      }),
      // An app already open on screen reloads its numbers, so nobody acts on a stale page.
      self.clients.matchAll({ type: "window" }).then((windows) => windows.forEach((w) => w.postMessage("refresh"))),
    ]),
  );
});

// Tapping it brings the app forward (it reloads its numbers when shown) or opens it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
