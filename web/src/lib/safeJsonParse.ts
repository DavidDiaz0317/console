/**
 * Safely parse a JSON string, returning a fallback value on failure.
 *
 * Use this instead of bare `JSON.parse()` in hooks and components to prevent
 * unhandled exceptions when localStorage, API responses, or WebSocket messages
 * contain malformed data.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T, context?: string): T {
  if (raw == null || raw === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    if (context) {
      console.warn(`[safeJsonParse] Failed to parse ${context}`)
    }
    return fallback
  }
}
