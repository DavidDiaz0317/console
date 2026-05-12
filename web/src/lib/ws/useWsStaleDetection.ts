/**
 * Shared WebSocket stale detection utility
 * Extracted from the pattern in useUpdateProgress.ts (#13247)
 *
 * Usage:
 * ```tsx
 * const { isStale, startStaleDetection, stopStaleDetection, updateLastMessageTime } =
 *   useWsStaleDetection(45_000, () => {
 *     // Handle stale state (e.g., set error, show warning)
 *   })
 *
 * // In ws.onmessage:
 * updateLastMessageTime()
 *
 * // Start monitoring when connection opens:
 * startStaleDetection()
 *
 * // Stop monitoring when connection closes or component unmounts:
 * stopStaleDetection()
 * ```
 */

import { useCallback, useRef, useState } from 'react'

const STALE_CHECK_INTERVAL_MS = 5_000 // Check every 5 seconds

export interface UseWsStaleDetectionResult {
  isStale: boolean
  startStaleDetection: () => void
  stopStaleDetection: () => void
  updateLastMessageTime: () => void
}

/**
 * Hook for detecting when a WebSocket connection has gone stale (no messages for a period).
 *
 * @param timeoutMs - Time in milliseconds after which the connection is considered stale
 * @param onStale - Callback invoked once when the connection becomes stale
 * @returns Stale state and control functions
 */
export function useWsStaleDetection(
  timeoutMs: number,
  onStale?: () => void,
): UseWsStaleDetectionResult {
  const [isStale, setIsStale] = useState(false)
  const lastMessageTimeRef = useRef<number>(0)
  const staleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onStaleCalledRef = useRef(false)

  const updateLastMessageTime = useCallback(() => {
    lastMessageTimeRef.current = Date.now()
    // Reset stale state when we receive a message
    if (isStale) {
      setIsStale(false)
      onStaleCalledRef.current = false
    }
  }, [isStale])

  const stopStaleDetection = useCallback(() => {
    if (staleTimerRef.current) {
      clearInterval(staleTimerRef.current)
      staleTimerRef.current = null
    }
    // Reset stale state when detection stops
    setIsStale(false)
    onStaleCalledRef.current = false
  }, [])

  const startStaleDetection = useCallback(() => {
    // Clear any existing timer
    stopStaleDetection()

    // Mark now as the baseline for stale checks
    lastMessageTimeRef.current = Date.now()
    onStaleCalledRef.current = false

    // Check every STALE_CHECK_INTERVAL_MS if we've gone silent for too long
    staleTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastMessageTimeRef.current
      if (elapsed > timeoutMs) {
        setIsStale(true)
        // Call onStale callback only once per stale period
        if (!onStaleCalledRef.current && onStale) {
          onStaleCalledRef.current = true
          onStale()
        }
      }
    }, STALE_CHECK_INTERVAL_MS)
  }, [timeoutMs, onStale, stopStaleDetection])

  return {
    isStale,
    startStaleDetection,
    stopStaleDetection,
    updateLastMessageTime,
  }
}
