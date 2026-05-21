import { useRef, useEffect } from 'react'
import { getCachedVersion, setCachedVersion } from './upgradeHelpers'

/** WebSocket connection timeout */
const WS_CONNECTION_TIMEOUT_MS = 5000

/** Interval for checking if WebSocket is ready */
const WS_READY_CHECK_INTERVAL_MS = 100

/** Timeout for version request */
const VERSION_REQUEST_TIMEOUT_MS = 10_000

interface VersionWsMessage {
  id?: string
  payload?: {
    output?: string
  }
}

/** Managed WebSocket handle — created per component mount, torn down on unmount */
interface VersionWsHandle {
  ensureWs: () => Promise<WebSocket>
  fetchClusterVersion: (clusterName: string, forceRefresh?: boolean) => Promise<string | null>
  destroy: () => void
}

function createVersionWsHandle(
  openTrackedWs: () => Promise<WebSocket>,
  parseWsMessage: (event: MessageEvent) => VersionWsMessage | null,
): VersionWsHandle {
  let ws: WebSocket | null = null
  let connecting = false
  let destroyed = false
  const pendingRequests = new Map<string, (version: string | null) => void>()
  /** Outstanding `setTimeout` handles created inside `ensureWs()` so
   * `destroy()` can cancel them. Previously these were discarded, so the
   * 10s connection timeout fired AFTER unmount and held stale closure
   * references calling `clearInterval` and `reject` on already-settled
   * promises (#6206). */
  const pendingEnsureTimers = new Set<ReturnType<typeof setTimeout>>()

  function rejectAllPending() {
    pendingRequests.forEach((resolver) => resolver(null))
    pendingRequests.clear()
  }

  function closeWs() {
    if (ws) {
      // Remove handlers before closing to avoid triggering reconnection logic
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
      ws = null
    }
    connecting = false
    rejectAllPending()
  }

  async function ensureWs(): Promise<WebSocket> {
    if (destroyed) return Promise.reject(new Error('Handle destroyed'))

    if (ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve(ws)
    }

    if (connecting) {
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (destroyed) { clearInterval(checkInterval); reject(new Error('Handle destroyed')); return }
          if (ws?.readyState === WebSocket.OPEN) { clearInterval(checkInterval); resolve(ws) }
        }, WS_READY_CHECK_INTERVAL_MS)
        // #6206: store the timeout handle so destroy() can cancel it.
        // Without this, the timeout would fire after unmount, call
        // clearInterval on a dead handle, and reject an already-settled
        // promise — holding stale closure references for up to 10s.
        const timeoutHandle = setTimeout(() => {
          pendingEnsureTimers.delete(timeoutHandle)
          clearInterval(checkInterval)
          reject(new Error('WebSocket connection timeout'))
        }, WS_CONNECTION_TIMEOUT_MS)
        pendingEnsureTimers.add(timeoutHandle)
      })
    }

    connecting = true

    return new Promise((resolve, reject) => {
      const setupSocket = async () => {
        let localWs: WebSocket
        try {
          localWs = await openTrackedWs()
        } catch {
          connecting = false
          reject(new Error('Failed to create WebSocket'))
          return
        }

        ws = localWs

        const connectionTimeout = setTimeout(() => {
          connecting = false
          if (localWs.readyState !== WebSocket.OPEN) {
            closeWs()
            reject(new Error('WebSocket connection timeout'))
          }
        }, VERSION_REQUEST_TIMEOUT_MS)

        localWs.onopen = () => {
          clearTimeout(connectionTimeout)
          connecting = false
          if (destroyed) { closeWs(); reject(new Error('Handle destroyed')); return }
          resolve(localWs)
        }

        localWs.onmessage = (event) => {
          const msg = parseWsMessage(event)
          if (!msg) return

          const resolver = pendingRequests.get(msg.id ?? '')
          if (resolver) {
            pendingRequests.delete(msg.id ?? '')
            if (msg.payload?.output) {
              try {
                const versionInfo = JSON.parse(msg.payload.output)
                resolver(versionInfo.serverVersion?.gitVersion || null)
              } catch {
                resolver(null)
              }
            } else {
              resolver(null)
            }
          }
        }

        localWs.onerror = () => {
          clearTimeout(connectionTimeout)
          connecting = false
          rejectAllPending()
          reject(new Error('WebSocket error'))
        }

        localWs.onclose = () => {
          clearTimeout(connectionTimeout)
          connecting = false
          ws = null
          rejectAllPending()
        }
      }

      void setupSocket()
    })
  }

  async function fetchClusterVersion(clusterName: string, forceRefresh = false): Promise<string | null> {
    if (destroyed) return getCachedVersion(clusterName)

    if (!forceRefresh) {
      const cached = getCachedVersion(clusterName)
      if (cached) return cached
    }

    try {
      const socket = await ensureWs()
      const requestId = `version-${clusterName}-${Date.now()}`

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          pendingRequests.delete(requestId)
          resolve(getCachedVersion(clusterName))
        }, VERSION_REQUEST_TIMEOUT_MS)

        pendingRequests.set(requestId, (version) => {
          clearTimeout(timeout)
          if (version) setCachedVersion(clusterName, version)
          resolve(version || getCachedVersion(clusterName))
        })

        if (socket.readyState !== WebSocket.OPEN) {
          pendingRequests.delete(requestId)
          clearTimeout(timeout)
          resolve(getCachedVersion(clusterName))
          return
        }

        socket.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: clusterName, args: ['version', '-o', 'json'] } }))
      })
    } catch {
      return getCachedVersion(clusterName)
    }
  }

  function destroy() {
    destroyed = true
    // Cancel any in-flight ensureWs() timeouts before closing the socket
    // so their stale closures don't fire after unmount (#6206).
    pendingEnsureTimers.forEach(t => clearTimeout(t))
    pendingEnsureTimers.clear()
    closeWs()
  }

  return { ensureWs, fetchClusterVersion, destroy }
}

export interface UseUpgradeWebSocketResult {
  wsHandle: VersionWsHandle | null
}

/**
 * Hook that manages a WebSocket connection for fetching cluster versions.
 * Creates a managed WebSocket handle on mount and destroys it on unmount.
 */
export function useUpgradeWebSocket(
  openTrackedWs: () => Promise<WebSocket>,
  parseWsMessage: (event: MessageEvent) => VersionWsMessage | null,
): UseUpgradeWebSocketResult {
  const wsHandleRef = useRef<VersionWsHandle | null>(null)
  
  if (!wsHandleRef.current) {
    wsHandleRef.current = createVersionWsHandle(openTrackedWs, parseWsMessage)
  }

  // Destroy WebSocket and pending requests on unmount
  useEffect(() => {
    const handle = wsHandleRef.current
    return () => {
      handle?.destroy()
      wsHandleRef.current = null
    }
  }, [])

  return { wsHandle: wsHandleRef.current }
}
