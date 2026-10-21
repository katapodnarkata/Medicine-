// Service worker веб-приложения «Оповещение команды».
// Работает в фоне: показывает уведомления о вызовах, даже когда приложение закрыто.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Пришло уведомление о вызове от сервера.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: '🚨 קריאה', body: event.data ? event.data.text() : '' };
  }
  const data = payload.data || {};
  const callId = data.callId;

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(payload.title || '🚨 קריאה', {
        body: payload.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: callId ? `call-${callId}` : undefined,
        renotify: true,
        requireInteraction: true,
        vibrate: [600, 300, 600, 300, 600],
        data: { callId },
      });
      // Если приложение открыто — сразу показать экран вызова.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: 'open-call', callId });
    })(),
  );
});

// Нажатие на уведомление открывает экран вызова.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const callId = event.notification.data && event.notification.data.callId;
  const url = callId ? `/call/${callId}` : '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({ type: 'open-call', callId });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
