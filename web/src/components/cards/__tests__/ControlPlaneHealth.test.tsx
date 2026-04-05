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

const mockPods = vi.fn()
// useCachedPods is now called once per CP namespace (5 calls per render).
// mockPods() returns the same value for every call which is fine for these tests.
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPods: () => mockPods(),
}))

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

import { ControlPlaneHealth } from '../ControlPlaneHealth'

describe('ControlPlaneHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockPods.mockReturnValue({ pods: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    mockUseClusters.mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now() })
  })

  it('renders without crashing', () => {
    const { container } = render(<ControlPlaneHealth />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<ControlPlaneHealth />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders skeleton UI when data is loading', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false, hasData: false, isRefreshing: false })
    mockPods.mockReturnValue({ pods: [], isLoading: true, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: null })
    mockUseClusters.mockReturnValue({ clusters: [], deduplicatedClusters: [], isLoading: true, isRefreshing: false, error: null, lastRefresh: null })
    const { container } = render(<ControlPlaneHealth />)
    // Skeleton renders animate-pulse elements or similar loading indicators
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<ControlPlaneHealth />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<ControlPlaneHealth />)
    expect(container).toBeTruthy()
  })

  it('handles data fetch failure', () => {
    mockPods.mockReturnValue({ pods: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: true, consecutiveFailures: 3, error: 'Network error', lastRefresh: null })
    const { container } = render(<ControlPlaneHealth />)
    expect(container).toBeTruthy()
  })

  it('renders during background refresh with cached data', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: true })
    mockPods.mockReturnValue({ pods: [], isLoading: false, isRefreshing: true, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    const { container } = render(<ControlPlaneHealth />)
    expect(container).toBeTruthy()
  })

  it('renders with cluster data available', () => {
    mockUseClusters.mockReturnValue({
      clusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }], deduplicatedClusters: [{ name: 'prod-cluster', healthy: true, reachable: true, nodeCount: 3, podCount: 10, cpuCores: 8, memoryGB: 16, cpuRequestsCores: 4, memoryRequestsGB: 8 }],
      isLoading: false, isRefreshing: false, error: null, lastRefresh: Date.now(),
    })
    const { container } = render(<ControlPlaneHealth />)
    expect(container).toBeTruthy()
  })

  it('reports demo fallback state', () => {
    mockPods.mockReturnValue({ pods: [], isLoading: false, isRefreshing: false, isDemoFallback: true, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() })
    render(<ControlPlaneHealth />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('does not show managed-cluster message when OpenShift namespace pods are present', () => {
    // Simulate an OpenShift cluster: kube-system returns nothing, but pods from
    // openshift-kube-apiserver are merged in (useCachedPods is called 5 times;
    // here every call returns the same mock so the API-server pod is present).
    const openshiftPod = {
      name: 'openshift-kube-apiserver-master-0',
      namespace: 'openshift-kube-apiserver',
      cluster: 'ocp-cluster',
      status: 'Running',
      restarts: 0,
      labels: { app: 'openshift-kube-apiserver' },
    }
    mockPods.mockReturnValue({
      pods: [openshiftPod],
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      error: null,
      lastRefresh: Date.now(),
    })
    mockUseClusters.mockReturnValue({
      clusters: [{ name: 'ocp-cluster' }],
      deduplicatedClusters: [{ name: 'ocp-cluster' }],
      isLoading: false,
      isRefreshing: false,
      error: null,
      lastRefresh: Date.now(),
    })
    const { queryByText } = render(<ControlPlaneHealth />)
    expect(queryByText('controlPlaneHealth.managedCluster')).toBeNull()
  })

  it('shows isFailed=true only when all namespace fetches have failed', () => {
    // If only some fetches fail the card should not be marked failed.
    // useCachedPods is called 5 times; mockReturnValueOnce lets the first four
    // succeed and the last one fail — isFailed overall should still be false.
    const okResult = { pods: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now() }
    const failResult = { pods: [], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: true, consecutiveFailures: 3, error: 'error', lastRefresh: null }
    mockPods
      .mockReturnValueOnce(okResult)
      .mockReturnValueOnce(okResult)
      .mockReturnValueOnce(okResult)
      .mockReturnValueOnce(okResult)
      .mockReturnValueOnce(failResult)
    // Should render without error (not enter a failed/empty state)
    const { container } = render(<ControlPlaneHealth />)
    expect(container).toBeTruthy()
    // useCardLoadingState should receive isFailed=false
    const lastCall = mockUseCardLoadingState.mock.calls[mockUseCardLoadingState.mock.calls.length - 1][0]
    expect(lastCall.isFailed).toBe(false)
  })

})