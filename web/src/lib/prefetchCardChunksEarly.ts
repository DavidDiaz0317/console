/**
 * Early card chunk prefetch — runs at the top of main.tsx BEFORE React renders.
 *
 * Reads the user's dashboard card types from localStorage and fires dynamic
 * imports immediately. This eliminates the 3-hop waterfall:
 *   old: auth → import(cardRegistry 195KB) → import(card chunk)
 *   new: import(card chunk) fires at module load time, in parallel with everything else
 *
 * The import map is intentionally duplicated here (not imported from cardRegistry)
 * to keep this module tiny (<2KB) and avoid pulling in the 195KB registry.
 */

const DASHBOARD_STORAGE_KEY = 'kubestellar-main-dashboard-cards'

// Lightweight import map — only covers card types used on common dashboards.
// Each entry maps a card_type string to a dynamic import() of its chunk.
// Shared bundles (deploy-bundle, ComplianceCards, etc.) are deduped by the browser.
const CHUNK_MAP: Record<string, () => Promise<unknown>> = {
  // Default main dashboard
  console_ai_offline_detection: () => import('../components/cards/console-missions/ConsoleOfflineDetectionCard'),
  hardware_health: () => import('../components/cards/HardwareHealthCard'),
  cluster_health: () => import('../components/cards/ClusterHealth'),
  resource_usage: () => import('../components/cards/ResourceUsage'),
  pod_issues: () => import('../components/cards/PodIssues'),
  cluster_metrics: () => import('../components/cards/ClusterMetrics'),
  event_stream: () => import('../components/cards/EventStream'),
  deployment_status: () => import('../components/cards/deploy-bundle'),
  events_timeline: () => import('../components/cards/EventsTimeline'),
  compliance_score: () => import('../components/cards/ComplianceCards'),
  // Common cards across dashboards
  top_pods: () => import('../components/cards/TopPods'),
  recent_events: () => import('../components/cards/RecentEvents'),
  security_issues: () => import('../components/cards/SecurityIssues'),
  app_status: () => import('../components/cards/AppStatus'),
  deployment_issues: () => import('../components/cards/deploy-bundle'),
  gpu_status: () => import('../components/cards/GPUStatus'),
  gpu_inventory: () => import('../components/cards/GPUInventory'),
  provider_health: () => import('../components/cards/ProviderHealth'),
  gpu_node_health: () => import('../components/cards/ProactiveGPUNodeHealthMonitor'),
  service_status: () => import('../components/cards/ServiceStatus'),
  storage_overview: () => import('../components/cards/StorageOverview'),
  network_overview: () => import('../components/cards/NetworkOverview'),
  compute_overview: () => import('../components/cards/ComputeOverview'),
  operator_status: () => import('../components/cards/OperatorStatus'),
}

// Default card types when no localStorage data exists
const DEFAULT_CARD_TYPES = [
  'console_ai_offline_detection', 'hardware_health', 'cluster_health',
  'resource_usage', 'pod_issues', 'cluster_metrics', 'event_stream',
  'deployment_status', 'events_timeline', 'compliance_score',
]

/**
 * Read the user's dashboard card types and fire imports immediately.
 * Call this at module scope in main.tsx — it runs synchronously.
 */
export function prefetchCardChunksEarly(): void {
  let cardTypes: string[] = DEFAULT_CARD_TYPES

  try {
    const stored = localStorage.getItem(DASHBOARD_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) {
        cardTypes = parsed.map((c: { card_type?: string }) => c.card_type).filter((t): t is string => Boolean(t))
      }
    }
  } catch {
    // Fall back to defaults
  }

  // Fire-and-forget — browser dedupes repeated import() calls for the same module
  const seen = new Set<string>()
  for (const type of cardTypes) {
    const loader = CHUNK_MAP[type]
    if (loader && !seen.has(type)) {
      seen.add(type)
      loader().catch(() => {})
    }
  }
}
