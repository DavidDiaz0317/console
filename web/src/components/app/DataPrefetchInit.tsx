import { useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { isDemoMode } from '@/lib/demoMode'

const PREFETCH_DEMO_CARDS_DELAY_MS = 15_000

// Default main dashboard card types — prefetched immediately so the first
// page renders without waiting for Dashboard.tsx to mount and trigger prefetch.
const DEFAULT_MAIN_CARD_TYPES = [
  'console_ai_offline_detection', 'hardware_health', 'cluster_health',
  'resource_usage', 'pod_issues', 'cluster_metrics', 'event_stream',
  'deployment_status', 'events_timeline',
]

// Prefetches core Kubernetes data and card chunks immediately after login
// so dashboard cards render instantly instead of showing skeletons.
// Uses dynamic imports to keep prefetchCardData (~92 KB useCachedData) and
// cardRegistry (~52 KB + 195 KB card configs) out of the main chunk.
export function DataPrefetchInit() {
  const { isAuthenticated } = useAuth()
  useEffect(() => {
    if (!isAuthenticated) return
    // Dynamic import: prefetchCardData pulls in useCachedData (~92 KB)
    import('@/lib/prefetchCardData').then(m => m.prefetchCardData()).catch(() => {})
    // Dynamic import: cardRegistry pulls in card configs (~195 KB)
    import('@/components/cards/cardRegistry').then(m => {
      // Prefetch default dashboard card chunks immediately — don't wait for
      // Dashboard.tsx to lazy-load and mount before starting chunk downloads.
      m.prefetchCardChunks(DEFAULT_MAIN_CARD_TYPES)
      // Demo-only card chunks are lower priority — defer in live mode.
      if (isDemoMode()) {
        m.prefetchDemoCardChunks()
      } else {
        setTimeout(m.prefetchDemoCardChunks, PREFETCH_DEMO_CARDS_DELAY_MS)
      }
    }).catch(() => {})
  }, [isAuthenticated])
  return null
}
