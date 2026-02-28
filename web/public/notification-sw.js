/**
 * Notification Service Worker
 *
 * Handles notification click events using clients.openWindow() which
 * correctly focuses the browser on macOS (unlike the window.focus() /
 * window.location.href approach used with new Notification()).
 */

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  const rawUrl = (event.notification.data && event.notification.data.url) || '/'

  // Validate that the URL belongs to this origin to prevent open-redirect attacks.
  let safeUrl
  try {
    const parsed = new URL(rawUrl, self.location.origin)
    if (parsed.origin !== self.location.origin) {
      console.warn('[NotificationSW] Blocked navigation to external origin:', rawUrl)
      safeUrl = '/'
    } else {
      safeUrl = parsed.href
    }
  } catch {
    safeUrl = '/'
  }

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        // Try to focus an existing window that belongs to this origin
        const focusable = clientList.find(function (client) { return 'focus' in client })
        if (focusable) {
          return focusable.focus().then(function (focusedClient) {
            return focusedClient.navigate(safeUrl)
          })
        }
        // No existing window — open a new one
        if (clients.openWindow) {
          return clients.openWindow(safeUrl)
        }
      })
      .catch(function (err) {
        console.error('[NotificationSW] Failed to handle notification click:', err)
      })
  )
})
