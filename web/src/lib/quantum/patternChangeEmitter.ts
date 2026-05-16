// Singleton pub/sub for quantum qubit pattern changes
// Used to trigger histogram refresh when new execution data arrives

type PatternChangeCallback = (pattern: string) => void

const subscribers = new Set<PatternChangeCallback>()

export function notifyPatternChange(pattern: string): void {
  subscribers.forEach((cb) => cb(pattern))

  // Cross-tab sync via storage event (localStorage emits storage events across tabs)
  try {
    localStorage.setItem('__quantum_pattern_change', JSON.stringify({ pattern, ts: Date.now() }))
  } catch {
    // Storage quota exceeded or not available
  }
}

export function subscribeToPatternChanges(callback: PatternChangeCallback): () => void {
  subscribers.add(callback)

  // Listen for cross-tab pattern changes via localStorage storage events
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === '__quantum_pattern_change' && e.newValue) {
      try {
        const { pattern } = JSON.parse(e.newValue)
        callback(pattern)
      } catch {
        // Ignore parse errors
      }
    }
  }

  window.addEventListener('storage', handleStorageChange)

  // Return unsubscribe function
  return () => {
    subscribers.delete(callback)
    window.removeEventListener('storage', handleStorageChange)
  }
}
