/**
 * Notification Service Worker
 *
 * Handles notification click events using clients.openWindow() which
 * correctly focuses the browser on macOS (unlike the window.focus() /
 * window.location.href approach used with new Notification()).
 */

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        // Try to focus an existing window that belongs to this origin
        const focusable = clientList.find(function (client) { return 'focus' in client })
        if (focusable) {
          return focusable.focus().then(function (focusedClient) {
            return focusedClient.navigate(url)
          })
        }
        // No existing window — open a new one
        if (clients.openWindow) {
          return clients.openWindow(url)
        }
      })
  )
})
