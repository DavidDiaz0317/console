import { SHORT_DELAY_MS } from '@/lib/constants/network'
import { isDemoMode } from '@/lib/demoMode'
import { fetchEnabledDashboards, getEnabledDashboardIds } from '@/hooks/useSidebarConfig'
import { DASHBOARD_CHUNKS } from '@/lib/dashboardChunks'
import { ROUTES } from '@/config/routes'

// Always prefetched regardless of enabled dashboards
const ALWAYS_PREFETCH = new Set(['dashboard', 'settings', 'clusters', 'cluster-admin', 'security', 'deploy'])

// Timing constants (milliseconds)
const PREFETCH_BATCH_SIZE = 8
const PREFETCH_BATCH_DELAY = 50
/** Max wait (ms) for the enabled-dashboards list before prefetching all chunks */
const PREFETCH_DASHBOARD_TIMEOUT_MS = 2_000

/** Routes where chunk prefetching is skipped to avoid errors during OAuth flow (#9767) */
const SKIP_PREFETCH_PATHS: ReadonlySet<string> = new Set([ROUTES.LOGIN, ROUTES.AUTH_CALLBACK])

// Prefetch lazy route chunks after initial page load.
// Batched to avoid overwhelming the Vite dev server with simultaneous
// module transformation requests (which delays navigation on cold start).
const prefetchRoutes = async () => {
  // Skip prefetching on auth pages — during OAuth redirects, the browser
  // navigates away before chunks finish loading, causing chunk_load errors.
  if (SKIP_PREFETCH_PATHS.has(window.location.pathname)) return
  // Wait for the enabled dashboards list from /health so we only
  // prefetch chunks the user will actually see. Timeout after 2s
  // and prefetch all chunks — better to over-prefetch than leave
  // chunks uncached and block navigation.
  try {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      fetchEnabledDashboards().finally(() => clearTimeout(timeoutId)),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), PREFETCH_DASHBOARD_TIMEOUT_MS)
      }),
    ])
  } catch {
    // Timeout or error — fall through to prefetch all
  }
  const enabledIds = getEnabledDashboardIds()

  // null = show all dashboards, otherwise only enabled + always-needed
  const chunks = enabledIds
    ? Object.entries(DASHBOARD_CHUNKS)
        .filter(([id]) => enabledIds.includes(id) || ALWAYS_PREFETCH.has(id))
        .map(([, load]) => load)
    : Object.values(DASHBOARD_CHUNKS)

  if (isDemoMode()) {
    // Demo mode: fire all immediately (synchronous data, no server load)
    chunks.forEach(load => load().catch(() => {}))
    return
  }

  // Live mode: batch imports to avoid saturating the dev server
  let offset = 0
  const loadBatch = () => {
    const batch = chunks.slice(offset, offset + PREFETCH_BATCH_SIZE)
    if (batch.length === 0) return
    Promise.allSettled(batch.map(load => load().catch(() => {}))).then(() => {
      offset += PREFETCH_BATCH_SIZE
      setTimeout(loadBatch, PREFETCH_BATCH_DELAY)
    })
  }
  loadBatch()
}

if (typeof window !== 'undefined') {
  // In demo mode, fire immediately. Otherwise defer 500ms to let
  // the first page render, then start caching all chunks so
  // subsequent navigations are instant.
  if (isDemoMode()) {
    prefetchRoutes()
  } else {
    setTimeout(prefetchRoutes, SHORT_DELAY_MS)
  }
}
