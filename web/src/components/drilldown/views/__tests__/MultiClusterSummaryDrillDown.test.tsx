import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../hooks/useClusterData', () => ({
  useClusterData: () => ({
    clusters: [
      { name: 'cluster-1', healthy: true, reachable: true, nodeCount: 3, podCount: 10, namespaces: ['default'] },
      { name: 'cluster-2', healthy: false, reachable: true, nodeCount: 2, podCount: 5, namespaces: ['default'] },
    ],
    deduplicatedClusters: [
      { name: 'cluster-1', healthy: true, reachable: true, nodeCount: 3, podCount: 10, namespaces: ['default'] },
      { name: 'cluster-2', healthy: false, reachable: true, nodeCount: 2, podCount: 5, namespaces: ['default'] },
    ],
    pods: [],
    deployments: [],
    events: [],
    helmReleases: [],
    operatorSubscriptions: [],
    securityIssues: [],
  }),
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToCluster: vi.fn(), drillToNamespace: vi.fn(), drillToDeployment: vi.fn(), drillToPod: vi.fn(), drillToNode: vi.fn(), drillToEvents: [], drillToHelm: null, drillToOperator: null }),
}))

vi.mock('../../../../hooks/useCachedData', () => ({
  useCachedNodes: () => ({ nodes: [], lastRefresh: Date.now() }),
}))

import { MultiClusterSummaryDrillDown } from '../MultiClusterSummaryDrillDown'

describe('MultiClusterSummaryDrillDown', () => {
  it('renders without crashing', () => {
    const { container } = render(<MultiClusterSummaryDrillDown data={{ filter: '' }} viewType="all-clusters" />)
    expect(container).toBeTruthy()
  })

  it('renders health summary stats section', () => {
    render(<MultiClusterSummaryDrillDown data={{ filter: '' }} viewType="all-clusters" />)
    // Health summary section shows "healthy" and "Issues" labels
    expect(screen.getByText('common.healthy')).toBeTruthy()
    expect(screen.getByText('Issues')).toBeTruthy()
  })

  it('shows healthy cluster count in health summary', () => {
    render(<MultiClusterSummaryDrillDown data={{ filter: '' }} viewType="all-clusters" />)
    // cluster-1 is healthy, cluster-2 is not — healthy count = 1
    const healthyCounts = screen.getAllByText('1')
    expect(healthyCounts.length).toBeGreaterThan(0)
  })

  it('renders status badges for each cluster', () => {
    render(<MultiClusterSummaryDrillDown data={{ filter: '' }} viewType="all-clusters" />)
    // Both clusters should have status badges
    const healthyBadges = screen.getAllByText('healthy')
    expect(healthyBadges.length).toBeGreaterThan(0)
    const unhealthyBadges = screen.getAllByText('unhealthy')
    expect(unhealthyBadges.length).toBeGreaterThan(0)
  })
})
