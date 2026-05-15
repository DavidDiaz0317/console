import { useRef, useEffect, useCallback } from 'react'
import { LOCAL_AGENT_WS_URL } from '../lib/constants'
import { appendWsAuthToken } from '../lib/utils/wsAuth'

/** Default timeout for WebSocket kubectl/helm commands (10 seconds). */
const DEFAULT_WS_TIMEOUT_MS = 10_000

/** Longer timeout for helm and heavy kubectl commands (15 seconds). */
export const HELM_WS_TIMEOUT_MS = 15_000

type CommandType = 'kubectl' | 'helm'

/**
 * Hook that provides tracked WebSocket command execution for drilldown views.
 *
 * - Tracks all active WebSocket connections and cleans them up on unmount
 * - Wraps JSON.parse in try-catch to prevent crashes from malformed messages
 * - Supports both kubectl and helm command types
 */
export function useDrillDownWebSocket(cluster: string) {
  const activeWsRef = useRef(new Set<WebSocket>())

  // Clean up all tracked WebSocket connections on unmount
  useEffect(() => {
    const wsSet = activeWsRef.current
    return () => {
      for (const ws of Array.from(wsSet)) {
        try { ws.close() } catch { /* already closed */ }
      }
      wsSet.clear()
    }
  }, [])

  /** Open a WebSocket and track it for cleanup on unmount. */
  const openTrackedWs = useCallback(async (): Promise<WebSocket | null> => {
    let wsUrl: string
    try {
      wsUrl = await appendWsAuthToken(LOCAL_AGENT_WS_URL)
    } catch {
      return null
    }
    const ws = new WebSocket(wsUrl)
    activeWsRef.current.add(ws)
    const origClose = ws.close.bind(ws)
    ws.close = (...args: Parameters<WebSocket['close']>) => {
      activeWsRef.current.delete(ws)
      origClose(...args)
    }
    return ws
  }, [])

  /**
   * Run a kubectl command via the local agent WebSocket.
   * Returns the command output as a string, or '' on failure/timeout.
   */
  const runKubectl = useCallback(async (
    args: string[],
    timeoutMs = DEFAULT_WS_TIMEOUT_MS,
  ): Promise<string> => {
    return runCommand('kubectl', args, timeoutMs)
  }, // eslint-disable-next-line react-hooks/exhaustive-deps
  [cluster, openTrackedWs])

  /**
   * Run a helm command via the local agent WebSocket.
   * Returns the command output as a string, or '' on failure/timeout.
   */
  const runHelm = useCallback(async (
    args: string[],
    timeoutMs = HELM_WS_TIMEOUT_MS,
  ): Promise<string> => {
    return runCommand('helm', args, timeoutMs)
  }, // eslint-disable-next-line react-hooks/exhaustive-deps
  [cluster, openTrackedWs])

  /** Internal: execute a command of the given type over a tracked WebSocket. */
  async function runCommand(
    type: CommandType,
    args: string[],
    timeoutMs: number,
  ): Promise<string> {
    const ws = await openTrackedWs()
    if (!ws) return ''

    return new Promise((resolve) => {
      const requestId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      let output = ''

      const timeout = setTimeout(() => {
        ws.close()
        resolve(output || '')
      }, timeoutMs)

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type,
          payload: { context: cluster, args },
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.id === requestId && msg.payload?.output) {
            output = msg.payload.output
          }
        } catch {
          // Malformed WS message — ignore and resolve with whatever we have
        }
        clearTimeout(timeout)
        ws.close()
        resolve(output)
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        ws.close()
        resolve(output || '')
      }
    })
  }

  return { runKubectl, runHelm }
}
