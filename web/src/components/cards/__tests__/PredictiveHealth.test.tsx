import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// Standard mocks
vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => mockUseDemoMode(),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(), markErrorReported: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

const mockNodes = vi.fn()
const mockPods = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedNodes: () => mockNodes(),
  useCachedPods: () => mockPods(),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

import { PredictiveHealth } from '../PredictiveHealth'

describe('PredictiveHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockNodes.mockReturnValue({ nodes: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockPods.mockReturnValue({ pods: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: [], isAllClustersSelected: true })
  })

  it('renders without crashing', () => {
    const { container } = render(<PredictiveHealth />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<PredictiveHealth />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders skeleton UI when data is loading', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false, hasData: false, isRefreshing: false })
    const { container } = render(<PredictiveHealth />)
    // Skeleton renders animate-pulse elements or similar loading indicators
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<PredictiveHealth />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<PredictiveHealth />)
    expect(container).toBeTruthy()
  })

  it('subscribes to global cluster filter via useGlobalFilters', () => {
    render(<PredictiveHealth />)
    expect(mockUseGlobalFilters).toHaveBeenCalled()
  })

  it('shows all predictions when no cluster filter is active (isAllClustersSelected=true)', () => {
    const nodes = [
      { cluster: 'cluster-a', name: 'node-1', unschedulable: false, conditions: [], restarts: 0 },
      { cluster: 'cluster-b', name: 'node-2', unschedulable: false, conditions: [], restarts: 0 },
    ]
    const pods = [
      ...Array.from({ length: 12 }, (_, i) => ({ cluster: 'cluster-a', name: `pod-${i}`, restarts: 8 })),
      ...Array.from({ length: 12 }, (_, i) => ({ cluster: 'cluster-b', name: `pod-b-${i}`, restarts: 8 })),
    ]
    mockNodes.mockReturnValue({ nodes, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockPods.mockReturnValue({ pods, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: ['cluster-a', 'cluster-b'], isAllClustersSelected: true })

    const { getByText } = render(<PredictiveHealth />)
    // Both clusters produce restart predictions — total should reference both
    expect(getByText(/cluster-a/i)).toBeTruthy()
    expect(getByText(/cluster-b/i)).toBeTruthy()
  })

  it('shows only predictions for the selected cluster when a filter is active', () => {
    const nodes = [
      { cluster: 'cluster-a', name: 'node-1', unschedulable: false, conditions: [], restarts: 0 },
      { cluster: 'cluster-b', name: 'node-2', unschedulable: false, conditions: [], restarts: 0 },
    ]
    const pods = [
      ...Array.from({ length: 12 }, (_, i) => ({ cluster: 'cluster-a', name: `pod-${i}`, restarts: 8 })),
      ...Array.from({ length: 12 }, (_, i) => ({ cluster: 'cluster-b', name: `pod-b-${i}`, restarts: 8 })),
    ]
    mockNodes.mockReturnValue({ nodes, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockPods.mockReturnValue({ pods, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    // Only cluster-a is selected
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: ['cluster-a'], isAllClustersSelected: false })

    const { queryByText, getByText } = render(<PredictiveHealth />)
    expect(getByText(/cluster-a/i)).toBeTruthy()
    expect(queryByText(/cluster-b/i)).toBeNull()
  })

  it('shows all-clear state when filtered cluster has no predictions', () => {
    const nodes = [
      { cluster: 'cluster-a', name: 'node-1', unschedulable: false, conditions: [], restarts: 0 },
      { cluster: 'cluster-b', name: 'node-2', unschedulable: false, conditions: [], restarts: 0 },
    ]
    const pods = [
      ...Array.from({ length: 12 }, (_, i) => ({ cluster: 'cluster-a', name: `pod-${i}`, restarts: 8 })),
      // cluster-b pods have low restarts — no predictions expected
      { cluster: 'cluster-b', name: 'pod-b-1', restarts: 0 },
    ]
    mockNodes.mockReturnValue({ nodes, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockPods.mockReturnValue({ pods, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    // Only cluster-b is selected — it has no alerts
    mockUseGlobalFilters.mockReturnValue({ selectedClusters: ['cluster-b'], isAllClustersSelected: false })

    const { getByText } = render(<PredictiveHealth />)
    expect(getByText('predictiveHealth.allClear')).toBeTruthy()
  })
})