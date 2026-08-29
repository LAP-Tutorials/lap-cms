self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const requestedUrl = event.notification.data?.url || '/admin/notifications';
  const destination = new URL(requestedUrl, self.location.origin);
  const isAllowedDestination =
    destination.protocol === 'https:' &&
    (destination.origin === self.location.origin || destination.origin === 'https://lap.onl');
  const safeUrl = isAllowedDestination
    ? destination.href
    : `${self.location.origin}/admin/notifications`;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && 'navigate' in client && 'focus' in client) {
          return client.navigate(safeUrl).then(() => client.focus());
        }
      }
      return self.clients.openWindow(safeUrl);
    })
  );
});
