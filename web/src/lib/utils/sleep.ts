/** Awaitable delay — use for backoff, debounce, or throttle patterns. */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
