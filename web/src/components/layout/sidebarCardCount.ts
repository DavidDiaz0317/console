import { DASHBOARD_CONFIGS } from '../../config/dashboards'
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

const HREF_TO_DASHBOARD_ID: Record<string, keyof typeof DASHBOARD_CONFIGS> = {
  '/': 'main',
  '/alerts': 'alerts',
  '/compute': 'compute',
  '/security': 'security',
  '/gitops': 'gitops',
  '/storage': 'storage',
  '/network': 'network',
  '/events': 'events',
  '/workloads': 'workloads',
  '/operators': 'operators',
  '/clusters': 'clusters',
  '/compliance': 'compliance',
  '/cost': 'cost',
  '/gpu-reservations': 'gpu',
  '/nodes': 'nodes',
  '/deployments': 'deployments',
  '/pods': 'pods',
  '/services': 'services',
  '/helm': 'helm',
  '/ai-ml': 'ai-ml',
  '/ci-cd': 'ci-cd',
  '/logs': 'logs',
  '/data-compliance': 'data-compliance',
  '/arcade': 'arcade',
  '/deploy': 'deploy',
  '/ai-agents': 'ai-agents',
  '/llm-d-benchmarks': 'llm-d-benchmarks',
  '/cluster-admin': 'cluster-admin',
  '/insights': 'insights',
  '/drasi': 'drasi',
  '/multi-tenancy': 'multi-tenancy',
  '/acmm': 'acmm',
}

export function getSidebarCardCount(config?: UnifiedDashboardConfig): number | null {
  if (!config) return null

  if (Array.isArray(config.cards) && config.cards.length > 0) {
    return config.cards.length
  }

  const firstTab = Array.isArray(config.tabs) ? config.tabs[0] : undefined
  if (firstTab && Array.isArray(firstTab.cards)) {
    return firstTab.cards.length
  }

  return Array.isArray(config.cards) ? config.cards.length : 0
}

export function getSidebarHrefCardCount(href: string): number | null {
  const dashboardId = HREF_TO_DASHBOARD_ID[href]
  return dashboardId ? getSidebarCardCount(DASHBOARD_CONFIGS[dashboardId]) : null
}
