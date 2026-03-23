/**
 * Prefetch a dashboard's route chunk, card chunks, and data on sidebar hover.
 *
 * The 200-500ms hover-before-click gap is enough to start downloading assets
 * and data in parallel, so by the time the user clicks, much of the work is
 * already in-flight or complete.
 */
import { DASHBOARD_CHUNKS } from './dashboardChunks'
import { DASHBOARD_CONFIGS } from '../config/dashboards/index'
import { prefetchCache } from './cache'
import { coreFetchers } from '../hooks/useCachedData'
import { isDemoMode } from './demoMode'

/** Map sidebar href to DASHBOARD_CHUNKS key */
function hrefToChunkId(href: string): string {
  if (href === '/') return 'dashboard'
  return href.replace(/^\//, '')
}

/** Map sidebar href to DASHBOARD_CONFIGS key */
const HREF_TO_CONFIG_ID: Record<string, string> = {
  '/': 'main', '/compute': 'compute', '/security': 'security',
  '/gitops': 'gitops', '/storage': 'storage', '/network': 'network',
  '/events': 'events', '/workloads': 'workloads', '/operators': 'operators',
  '/clusters': 'clusters', '/compliance': 'compliance', '/cost': 'cost',
  '/gpu-reservations': 'gpu', '/nodes': 'nodes', '/deployments': 'deployments',
  '/pods': 'pods', '/services': 'services', '/helm': 'helm',
  '/alerts': 'alerts', '/ai-ml': 'ai-ml', '/ci-cd': 'ci-cd',
  '/logs': 'logs', '/data-compliance': 'data-compliance', '/arcade': 'arcade',
  '/deploy': 'deploy', '/ai-agents': 'ai-agents',
  '/llm-d-benchmarks': 'llm-d-benchmarks', '/cluster-admin': 'cluster-admin',
  '/insights': 'insights', '/multi-tenancy': 'multi-tenancy',
  '/marketplace': 'marketplace',
}

/**
 * Card type → cache entries to prefetch.
 * Only covers card types that use data already available via coreFetchers,
 * so we don't introduce new API calls or import heavyweight fetchers.
 */
const CARD_DATA_PREFETCH: Record<string, Array<{ key: string; fetcher: () => Promise<unknown> }>> = {
  pod_issues:          [{ key: 'podIssues:all:all',        fetcher: coreFetchers.podIssues }],
  top_pods:            [{ key: 'pods:all:all:100',          fetcher: coreFetchers.pods }],
  event_stream:        [{ key: 'events:all:all:20',         fetcher: coreFetchers.events }],
  event_summary:       [{ key: 'events:all:all:20',         fetcher: coreFetchers.events }],
  recent_events:       [{ key: 'events:all:all:20',         fetcher: coreFetchers.events }],
  events_timeline:     [{ key: 'events:all:all:20',         fetcher: coreFetchers.events }],
  warning_events:      [{ key: 'events:all:all:20',         fetcher: coreFetchers.events }],
  deployment_status:   [{ key: 'deployments:all:all',       fetcher: coreFetchers.deployments }],
  deployment_issues:   [{ key: 'deploymentIssues:all:all',  fetcher: coreFetchers.deploymentIssues }],
  deployment_progress: [{ key: 'deployments:all:all',       fetcher: coreFetchers.deployments }],
  security_issues:     [{ key: 'securityIssues:all:all',    fetcher: coreFetchers.securityIssues }],
  service_status:      [{ key: 'services:all:all',          fetcher: coreFetchers.services }],
  resource_usage:      [{ key: 'pods:all:all:100',          fetcher: coreFetchers.pods }],
  cluster_health:      [{ key: 'pods:all:all:100',          fetcher: coreFetchers.pods }],
  app_status:          [{ key: 'deployments:all:all',       fetcher: coreFetchers.deployments }],
}

/** Avoid re-triggering for the same link on repeated hover */
let lastPrefetchedHref: string | null = null

export function prefetchDashboard(href: string): void {
  if (href === lastPrefetchedHref) return
  lastPrefetchedHref = href

  // Demo mode uses synchronous data — no fetching needed
  if (isDemoMode()) return

  // Layer 1: Route chunk
  const chunkId = hrefToChunkId(href)
  DASHBOARD_CHUNKS[chunkId]?.()?.catch(() => {})

  // Layer 2: Card component chunks
  const configId = HREF_TO_CONFIG_ID[href]
  const config = configId ? DASHBOARD_CONFIGS[configId] : null
  if (config?.cards) {
    const cardTypes = config.cards.map((c: { cardType: string }) => c.cardType)

    // Dynamic import keeps the 195KB card registry out of the sidebar chunk
    import('../components/cards/cardRegistry').then(m => {
      m.prefetchCardChunks(cardTypes)
    }).catch(() => {})

    // Layer 3: Data for cards with known fetchers
    const seen = new Set<string>()
    for (const cardType of cardTypes) {
      const entries = CARD_DATA_PREFETCH[cardType]
      if (!entries) continue
      for (const entry of entries) {
        if (seen.has(entry.key)) continue
        seen.add(entry.key)
        prefetchCache(entry.key, entry.fetcher, []).catch(() => {})
      }
    }
  }
}
