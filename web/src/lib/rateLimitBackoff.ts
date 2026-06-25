/** localStorage key for global API rate-limit backoff deadline (epoch ms). */
export const STORAGE_KEY_RATE_LIMIT_UNTIL = 'kc-api-rate-limit-until'

/** Default Retry-After when the header is missing or unparseable. */
export const DEFAULT_RATE_LIMIT_RETRY_AFTER_S = 60

export interface RateLimitBackoffState {
  until: number
  retryAfter: number
}

export class RateLimitError extends Error {
  retryAfter: number

  constructor(retryAfter: number) {
    super(`Rate limited. Try again in ${retryAfter} seconds.`)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function parseRetryAfterSeconds(value: string | null): number {
  if (!value) return DEFAULT_RATE_LIMIT_RETRY_AFTER_S
  const numeric = Number.parseInt(value, 10)
  if (Number.isFinite(numeric) && numeric > 0) return numeric

  const retryDate = Date.parse(value)
  if (Number.isFinite(retryDate)) {
    const seconds = Math.ceil((retryDate - Date.now()) / 1000)
    if (seconds > 0) return seconds
  }

  return DEFAULT_RATE_LIMIT_RETRY_AFTER_S
}

export function getRateLimitBackoff(now = Date.now()): RateLimitBackoffState | null {
  const store = storage()
  if (!store) return null

  const raw = store.getItem(STORAGE_KEY_RATE_LIMIT_UNTIL)
  if (!raw) return null

  const until = Number.parseInt(raw, 10)
  if (!Number.isFinite(until) || until <= now) {
    store.removeItem(STORAGE_KEY_RATE_LIMIT_UNTIL)
    return null
  }

  return {
    until,
    retryAfter: Math.max(1, Math.ceil((until - now) / 1000)),
  }
}

export function isRateLimitBackoffActive(now = Date.now()): boolean {
  return getRateLimitBackoff(now) !== null
}

export function setRateLimitBackoff(retryAfterSeconds: number, now = Date.now()): RateLimitBackoffState {
  const effectiveRetry = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds
    : DEFAULT_RATE_LIMIT_RETRY_AFTER_S
  const until = now + effectiveRetry * 1000
  try {
    storage()?.setItem(STORAGE_KEY_RATE_LIMIT_UNTIL, String(until))
  } catch {
    // Storage can be unavailable in private/embedded contexts. Callers still
    // get the computed backoff for the current request.
  }
  return { until, retryAfter: effectiveRetry }
}

export function setRateLimitBackoffFromResponse(response: Response): RateLimitBackoffState {
  return setRateLimitBackoff(parseRetryAfterSeconds(response.headers.get('Retry-After')))
}

export function throwIfRateLimited(): void {
  const backoff = getRateLimitBackoff()
  if (backoff) {
    throw new RateLimitError(backoff.retryAfter)
  }
}

export async function waitForRateLimitBackoff(signal?: AbortSignal): Promise<void> {
  const backoff = getRateLimitBackoff()
  if (!backoff) return

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, Math.max(0, backoff.until - Date.now()))
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}
