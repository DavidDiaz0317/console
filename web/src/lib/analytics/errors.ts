// ── Error Tracking ─────────────────────────────────────────────────

import { CHUNK_RELOAD_TS_KEY, isChunkLoadMessage } from '../chunkErrors'
import { send, setPendingRecoveryEvent } from './core'

// Maximum length for error detail strings to avoid oversized payloads
export const ERROR_DETAIL_MAX_LEN = 100

/**
 * Dedup set for errors already reported by React error boundaries.
 * When an error is caught by DynamicCardErrorBoundary or AppErrorBoundary,
 * the error message is added here. The global window 'error' and
 * 'unhandledrejection' listeners check this set and skip errors that
 * were already reported — preventing the same error from being counted
 * as both 'card_render' AND 'runtime', or 'uncaught_render' AND 'runtime'.
 * Entries expire after 5 seconds to avoid unbounded growth.
 */
const DEDUP_EXPIRY_MS = 5_000
const recentlyReportedErrors = new Map<string, number>()

/** Mark an error message as already reported by an error boundary */
export function markErrorReported(msg: string) {
  recentlyReportedErrors.set(msg.slice(0, ERROR_DETAIL_MAX_LEN), Date.now())
}

/** Check if an error was already reported by an error boundary */
function wasAlreadyReported(msg: string): boolean {
  const key = msg.slice(0, ERROR_DETAIL_MAX_LEN)
  const ts = recentlyReportedErrors.get(key)
  if (!ts) return false
  if (Date.now() - ts > DEDUP_EXPIRY_MS) {
    recentlyReportedErrors.delete(key)
    return false
  }
  return true
}

export function emitError(category: string, detail: string, cardId?: string) {
  send('ksc_error', {
    error_category: category,
    error_detail: detail.slice(0, ERROR_DETAIL_MAX_LEN),
    error_page: window.location.pathname,
    ...(cardId && { card_id: cardId }),
  })
}

/**
 * Check if this page load is a recovery from a chunk-load auto-reload.
 * If CHUNK_RELOAD_TS_KEY exists in sessionStorage, the previous page load
 * hit a stale chunk error and triggered window.location.reload().
 *
 * Called at startup (before user interaction), so we cannot call send()
 * directly — it gates on userHasInteracted and would drop the event.
 * Instead, store the data in pendingRecoveryEvent and flush it in
 * onFirstInteraction() once send() is unblocked.
 */
function checkChunkReloadRecovery() {
  try {
    const reloadTs = sessionStorage.getItem(CHUNK_RELOAD_TS_KEY)
    if (!reloadTs) return

    const reloadTime = parseInt(reloadTs)
    const recoveryMs = Date.now() - reloadTime

    // Clear the marker so we don't re-emit on subsequent navigations
    sessionStorage.removeItem(CHUNK_RELOAD_TS_KEY)

    // Defer until first user interaction so send() isn't blocked by
    // the userHasInteracted gate (onFirstInteraction flushes this).
    setPendingRecoveryEvent({
      latencyMs: recoveryMs,
      page: window.location.pathname,
    })
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

// Reload throttle interval — must match ChunkErrorBoundary to prevent loops
/** Global throttle for chunk-error auto-reload — 5s is fast enough for back-to-back deploys */
const GLOBAL_RELOAD_THROTTLE_MS = 5_000

/**
 * If the error message indicates a stale-chunk failure, auto-reload once
 * (same throttle logic as ChunkErrorBoundary). Returns true when the error
 * IS a chunk error so the caller skips emitting a duplicate 'runtime' event.
 */
function tryChunkReloadRecovery(msg: string): boolean {
  if (!isChunkLoadMessage(msg)) return false
  // Only emit chunk_load from the global handler if ChunkErrorBoundary
  // hasn't already reported this same error message (prevents double-counting)
  if (!wasAlreadyReported(msg)) {
    emitError('chunk_load', msg)
  }
  try {
    const lastReload = sessionStorage.getItem(CHUNK_RELOAD_TS_KEY)
    const now = Date.now()
    if (!lastReload || now - parseInt(lastReload) > GLOBAL_RELOAD_THROTTLE_MS) {
      sessionStorage.setItem(CHUNK_RELOAD_TS_KEY, String(now))
      window.location.reload()
      return true
    }
    // Already reloaded recently — recovery failed
    sessionStorage.removeItem(CHUNK_RELOAD_TS_KEY)
    emitChunkReloadRecoveryFailed(msg)
  } catch {
    // sessionStorage unavailable — chunk_load was already emitted above
  }
  // Always return true when the error IS a chunk error — prevents the caller
  // from also emitting a 'runtime' error for the same event (double reporting).
  return true
}

/** Track unhandled promise rejections and runtime errors globally */
export function startGlobalErrorTracking() {
  // Check if we just recovered from a chunk-load auto-reload
  checkChunkReloadRecovery()

  // Re-entrancy guard: if emitError() → send() triggers another error,
  // the global handler must NOT call emitError() again (infinite recursion → max call stack)
  let isEmitting = false

  window.addEventListener('unhandledrejection', (event) => {
    if (isEmitting) return
    isEmitting = true
    try {
      const msg = event.reason?.message || String(event.reason || 'unknown')
      // Skip errors already reported by React error boundaries (prevents double-counting)
      if (wasAlreadyReported(msg)) return
      // Skip clipboard API errors — expected on non-HTTPS and in restricted contexts
      if (msg.includes('writeText') || msg.includes('clipboard') || msg.includes('copy')) return
      // Stale chunks can surface as unhandled rejections from dynamic import()
      if (tryChunkReloadRecovery(msg)) return
      // Skip AbortError / TimeoutError — expected when fetches are cancelled on unmount
      // or when AbortSignal.timeout() fires. Different browsers surface different messages:
      //   Safari:  "Fetch is aborted."  |  Chrome: "The user aborted a request."
      //   Safari timeout: "The operation timed out."  |  Chrome timeout: "signal timed out"
      const errorName: string = (event.reason as { name?: string })?.name ?? ''
      if (errorName === 'AbortError' || errorName === 'TimeoutError') return
      if (
        msg.includes('Fetch is aborted') ||
        msg.includes('The user aborted a request') ||
        msg.includes('signal is aborted') ||
        msg.includes('The operation timed out') ||
        msg.includes('signal timed out') ||
        msg.includes('Load failed')
      ) return
      // Skip WebKit URL-parse errors — "The string did not match the expected pattern."
      // is thrown by new URL() in Safari when the input is invalid. These surface as
      // unhandled rejections when they occur inside async functions; the errors are
      // typically transient (stale cache data, invalid cluster server URLs).
      if (msg.includes('did not match the expected pattern')) return
      // Skip JSON parse / SyntaxError errors from response.json() calls.
      // These occur when the backend temporarily returns HTML (e.g. 502/503 gateway
      // errors, nginx error pages) instead of JSON. The calling code catches them
      // internally; they surface here only because browsers report the rejected
      // Promise before the catch handler runs in some edge cases.
      //   Firefox:  "JSON.parse: unexpected character at line 1 column 1 …"
      //   Chrome:   "… is not valid JSON"
      //   Safari:   "JSON Parse error: Unexpected token <"
      if (
        msg.includes('JSON.parse') ||
        msg.includes('is not valid JSON') ||
        msg.includes('JSON Parse error') ||
        msg.includes('Unexpected token')
      ) return
      // Skip ServiceWorker notification errors — expected when the SW registration
      // becomes inactive (browser idle, SW update). The calling code catches these
      // and falls back to the standard Notification API.
      if (msg.includes('showNotification') || msg.includes('No active registration')) return
      // Skip WebSocket send-before-connect errors — transient race condition in
      // Safari where the WS transitions out of OPEN between readyState check and
      // send(). The kubectlProxy try/catch handles these; they surface here only
      // due to browser microtask ordering.
      if (msg.includes('send was called before connect') || msg.includes('InvalidStateError')) return
      emitError('unhandled_rejection', msg)
    } finally {
      isEmitting = false
    }
  })

  window.addEventListener('error', (event) => {
    // Skip errors from cross-origin scripts (no useful info)
    if (!event.message || event.message === 'Script error.') return
    if (isEmitting) return
    isEmitting = true
    try {
      // Skip errors already reported by React error boundaries (prevents double-counting)
      if (wasAlreadyReported(event.message)) return
      // Skip clipboard API errors — expected on non-HTTPS and in restricted contexts
      if (event.message.includes('writeText') || event.message.includes('clipboard') || event.message.includes('copy')) return
      // Stale chunks can surface as runtime errors (Safari: "Importing a module script failed")
      if (tryChunkReloadRecovery(event.message)) return
      emitError('runtime', event.message)
    } finally {
      isEmitting = false
    }
  })
}

export function emitSessionExpired() {
  send('ksc_session_expired')
}

/** Emit when auto-reload failed to fix stale chunks (user sees manual reload UI) */
export function emitChunkReloadRecoveryFailed(errorDetail: string) {
  send('ksc_chunk_reload_recovery', {
    recovery_result: 'failed',
    recovery_page: window.location.pathname,
    error_detail: errorDetail.slice(0, ERROR_DETAIL_MAX_LEN),
  })
}
