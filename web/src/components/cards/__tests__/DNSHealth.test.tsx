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

const mockUseCachedPods = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPods: (_cluster: unknown, namespace: unknown) => mockUseCachedPods(namespace),
}))

const emptyPodsResult = () => ({
  pods: [], isLoading: false, isRefreshing: false, isDemoFallback: false,
  isFailed: false, consecutiveFailures: 0, error: null, lastRefresh: Date.now(),
})

import { DNSHealth } from '../DNSHealth'

describe('DNSHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    // Default: both namespaces return empty pods
    mockUseCachedPods.mockReturnValue(emptyPodsResult())
  })

  it('renders without crashing', () => {
    const { container } = render(<DNSHealth />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<DNSHealth />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('fetches pods from both kube-system and openshift-dns namespaces', () => {
    render(<DNSHealth />)
    expect(mockUseCachedPods).toHaveBeenCalledWith('kube-system')
    expect(mockUseCachedPods).toHaveBeenCalledWith('openshift-dns')
  })

  it('renders skeleton UI when data is loading', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false, hasData: false, isRefreshing: false })
    mockUseCachedPods.mockReturnValue({ ...emptyPodsResult(), isLoading: true })
    const { container } = render(<DNSHealth />)
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('shows DNS pods from kube-system (coredns)', () => {
    const corednsPod = { name: 'coredns-abc123', namespace: 'kube-system', cluster: 'prod', status: 'Running', ready: '1/1', restarts: 0 }
    mockUseCachedPods.mockImplementation((ns: string) =>
      ns === 'kube-system'
        ? { ...emptyPodsResult(), pods: [corednsPod] }
        : emptyPodsResult()
    )
    const { getByText } = render(<DNSHealth />)
    expect(getByText('prod')).toBeTruthy()
  })

  it('shows DNS pods from openshift-dns (dns-default)', () => {
    const dnsDefaultPod = { name: 'dns-default-xyz99', namespace: 'openshift-dns', cluster: 'openshift-cluster', status: 'Running', ready: '1/1', restarts: 0 }
    mockUseCachedPods.mockImplementation((ns: string) =>
      ns === 'openshift-dns'
        ? { ...emptyPodsResult(), pods: [dnsDefaultPod] }
        : emptyPodsResult()
    )
    const { getByText } = render(<DNSHealth />)
    expect(getByText('openshift-cluster')).toBeTruthy()
  })

  it('merges pods from both kube-system and openshift-dns', () => {
    const corednsPod = { name: 'coredns-abc123', namespace: 'kube-system', cluster: 'k8s-cluster', status: 'Running', ready: '1/1', restarts: 0 }
    const dnsDefaultPod = { name: 'dns-default-xyz99', namespace: 'openshift-dns', cluster: 'openshift-cluster', status: 'Running', ready: '1/1', restarts: 0 }
    mockUseCachedPods.mockImplementation((ns: string) =>
      ns === 'kube-system'
        ? { ...emptyPodsResult(), pods: [corednsPod] }
        : { ...emptyPodsResult(), pods: [dnsDefaultPod] }
    )
    const { getByText } = render(<DNSHealth />)
    expect(getByText('k8s-cluster')).toBeTruthy()
    expect(getByText('openshift-cluster')).toBeTruthy()
  })

  it('does not mark as failed when only one namespace fails', () => {
    mockUseCachedPods.mockImplementation((ns: string) =>
      ns === 'kube-system'
        ? { ...emptyPodsResult(), pods: [{ name: 'coredns-abc', namespace: 'kube-system', cluster: 'prod', status: 'Running', ready: '1/1', restarts: 0 }] }
        : { ...emptyPodsResult(), isFailed: true, consecutiveFailures: 3 }
    )
    render(<DNSHealth />)
    const callArgs = mockUseCardLoadingState.mock.calls[0][0] as { isFailed: boolean }
    expect(callArgs.isFailed).toBe(false)
  })

  it('marks as failed when both namespaces fail', () => {
    mockUseCachedPods.mockReturnValue({ ...emptyPodsResult(), isFailed: true, consecutiveFailures: 3 })
    render(<DNSHealth />)
    const callArgs = mockUseCardLoadingState.mock.calls[0][0] as { isFailed: boolean }
    expect(callArgs.isFailed).toBe(true)
  })

  it('renders correctly in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<DNSHealth />)
    expect(container).toBeTruthy()
  })

  it('renders correctly in non-demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    const { container } = render(<DNSHealth />)
    expect(container).toBeTruthy()
  })

  it('handles data fetch failure', () => {
    mockUseCachedPods.mockReturnValue({ ...emptyPodsResult(), isFailed: true, consecutiveFailures: 3, error: 'Network error' })
    const { container } = render(<DNSHealth />)
    expect(container).toBeTruthy()
  })

  it('renders during background refresh with cached data', () => {
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: true })
    mockUseCachedPods.mockReturnValue({ ...emptyPodsResult(), isRefreshing: true })
    const { container } = render(<DNSHealth />)
    expect(container).toBeTruthy()
  })

  it('reports demo fallback state', () => {
    mockUseCachedPods.mockReturnValue({ ...emptyPodsResult(), isDemoFallback: true })
    render(<DNSHealth />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

})