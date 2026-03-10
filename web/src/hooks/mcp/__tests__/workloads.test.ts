import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mock instances — created before any vi.mock() factories run
// ---------------------------------------------------------------------------

const {
  mockFetchSSE,
  mockIsDemoMode,
  mockIsBackendUnavailable,
  mockIsAgentUnavailable,
  mockReportAgentDataSuccess,
  mockApiGet,
  mockGetPodIssues,
  mockGetDeployments,
  mockRegisterRefetch,
  mockRegisterCacheReset,
  mockClusterCacheRef,
} = vi.hoisted(() => ({
  mockFetchSSE: vi.fn(),
  mockIsDemoMode: vi.fn(() => false),
  mockIsBackendUnavailable: vi.fn(() => false),
  mockIsAgentUnavailable: vi.fn(() => false),
  mockReportAgentDataSuccess: vi.fn(),
  mockApiGet: vi.fn(),
  mockGetPodIssues: vi.fn(),
  mockGetDeployments: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockRegisterCacheReset: vi.fn(() => vi.fn()),
  mockClusterCacheRef: { clusters: [] as Array<{ name: string; context?: string; reachable?: boolean }> },
}))

// ---------------------------------------------------------------------------
// Module mocks (paths relative to THIS test file)
// ---------------------------------------------------------------------------

vi.mock('../../../lib/sseClient', () => ({
  fetchSSE: (...args: unknown[]) => mockFetchSSE(...args),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../../lib/api', () => ({
  isBackendUnavailable: () => mockIsBackendUnavailable(),
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}))

vi.mock('../../useLocalAgent', () => ({
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  reportAgentDataSuccess: () => mockReportAgentDataSuccess(),
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: {
    getPodIssues: (...args: unknown[]) => mockGetPodIssues(...args),
    getDeployments: (...args: unknown[]) => mockGetDeployments(...args),
  },
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
}))

vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 120_000,
  MIN_REFRESH_INDICATOR_MS: 0,
  getEffectiveInterval: (n: number) => n,
  LOCAL_AGENT_URL: 'http://localhost:8585',
  clusterCacheRef: mockClusterCacheRef,
}))

vi.mock('../../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'token',
}))

vi.mock('../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 5_000,
}))

// ---------------------------------------------------------------------------
// Module under test — dynamically imported after each resetModules()
// so module-level caches are always fresh
// ---------------------------------------------------------------------------

type WorkloadsModule = typeof import('../workloads')
let hooks: WorkloadsModule

// Holds the callback registered with registerCacheReset('workloads', cb)
let triggerWorkloadsCacheReset: (() => void) | undefined

const originalFetch = globalThis.fetch

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'test-token')

  mockClusterCacheRef.clusters = []
  mockIsAgentUnavailable.mockReturnValue(true)   // agent unavailable by default
  mockIsBackendUnavailable.mockReturnValue(false)
  mockIsDemoMode.mockReturnValue(false)
  mockRegisterRefetch.mockReturnValue(vi.fn())   // cleanup fn

  // Capture the cache-reset callback when the module is initialised
  triggerWorkloadsCacheReset = undefined
  mockRegisterCacheReset.mockImplementation((key: string, cb: () => void) => {
    if (key === 'workloads') triggerWorkloadsCacheReset = cb
    return vi.fn()
  })

  globalThis.fetch = vi.fn()

  hooks = await import('../workloads')
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePod(overrides: Partial<{
  name: string; namespace: string; cluster: string; status: string
  ready: string; restarts: number; age: string; node: string
}> = {}) {
  return {
    name: 'pod-1',
    namespace: 'default',
    cluster: 'test-cluster',
    status: 'Running',
    ready: '1/1',
    restarts: 0,
    age: '1d',
    node: 'node-1',
    ...overrides,
  }
}

function makeDeployment(overrides: Partial<{
  name: string; namespace: string; cluster: string; status: string
  replicas: number; readyReplicas: number; updatedReplicas: number
  availableReplicas: number; progress: number
}> = {}) {
  return {
    name: 'deploy-1',
    namespace: 'default',
    cluster: 'test-cluster',
    status: 'running' as const,
    replicas: 1,
    readyReplicas: 1,
    updatedReplicas: 1,
    availableReplicas: 1,
    progress: 100,
    ...overrides,
  }
}

// ============================================================================
// usePods
// ============================================================================

describe('usePods', () => {
  it('returns initial loading state when no cache exists', () => {
    // fetchSSE never resolves — keeps the hook in loading state
    mockFetchSSE.mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => hooks.usePods())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.pods).toEqual([])
  })

  it('returns cached data immediately when localStorage cache exists', async () => {
    const cachedPod = makePod({ name: 'cached-pod', restarts: 5 })
    localStorage.setItem('kubestellar-pods-cache', JSON.stringify({
      data: [cachedPod],
      timestamp: new Date().toISOString(),
      key: 'pods:all:all',
    }))

    // Background refresh that never resolves (so cache remains as-is)
    mockFetchSSE.mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => hooks.usePods())

    // Cache is read synchronously in useState initialiser
    expect(result.current.isLoading).toBe(false)
    expect(result.current.pods).toHaveLength(1)
    expect(result.current.pods[0].name).toBe('cached-pod')
  })

  it('fetches pods from /api/mcp/pods/stream', async () => {
    const pod = makePod()
    mockFetchSSE.mockResolvedValueOnce([pod])

    const { result } = renderHook(() => hooks.usePods())

    await waitFor(() => expect(result.current.pods).toHaveLength(1))
    expect(mockFetchSSE).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/mcp/pods/stream' }),
    )
    expect(result.current.isLoading).toBe(false)
  })

  it('passes cluster and namespace params to fetchSSE', async () => {
    mockFetchSSE.mockResolvedValueOnce([])

    renderHook(() => hooks.usePods('prod-cluster', 'production'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    expect(mockFetchSSE).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { cluster: 'prod-cluster', namespace: 'production' },
      }),
    )
  })

  it('sorts by restarts (default) — highest first', async () => {
    const pods = [
      makePod({ name: 'low', restarts: 1 }),
      makePod({ name: 'high', restarts: 10 }),
      makePod({ name: 'mid', restarts: 5 }),
    ]
    mockFetchSSE.mockResolvedValueOnce(pods)

    const { result } = renderHook(() => hooks.usePods())

    await waitFor(() => expect(result.current.pods).toHaveLength(3))
    expect(result.current.pods[0].restarts).toBe(10)
    expect(result.current.pods[1].restarts).toBe(5)
    expect(result.current.pods[2].restarts).toBe(1)
  })

  it('sorts by name when sortBy="name"', async () => {
    const pods = [
      makePod({ name: 'zebra-pod' }),
      makePod({ name: 'alpha-pod' }),
      makePod({ name: 'mango-pod' }),
    ]
    mockFetchSSE.mockResolvedValueOnce(pods)

    const { result } = renderHook(() => hooks.usePods(undefined, undefined, 'name'))

    await waitFor(() => expect(result.current.pods).toHaveLength(3))
    expect(result.current.pods[0].name).toBe('alpha-pod')
    expect(result.current.pods[1].name).toBe('mango-pod')
    expect(result.current.pods[2].name).toBe('zebra-pod')
  })

  it('respects the limit argument', async () => {
    const pods = Array.from({ length: 20 }, (_, i) =>
      makePod({ name: `pod-${i}`, restarts: 20 - i }),
    )
    mockFetchSSE.mockResolvedValueOnce(pods)

    const { result } = renderHook(() => hooks.usePods(undefined, undefined, 'restarts', 5))

    await waitFor(() => expect(result.current.pods).toHaveLength(5))
  })

  it('falls back to demo pods on first fetch failure without cache', async () => {
    mockFetchSSE.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => hooks.usePods())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.pods.length).toBeGreaterThan(0)
      expect(result.current.error).toBe('Failed to fetch pods')
    })
  })

  it('preserves stale data on silent refresh failure when cache exists', async () => {
    // Seed localStorage cache
    const cachedPod = makePod({ name: 'stale-pod' })
    localStorage.setItem('kubestellar-pods-cache', JSON.stringify({
      data: [cachedPod],
      timestamp: new Date().toISOString(),
      key: 'pods:all:all',
    }))

    // Silent refresh fails
    mockFetchSSE.mockRejectedValueOnce(new Error('Refresh failed'))

    const { result } = renderHook(() => hooks.usePods())

    // Still has cached data, no error surfaced on silent refresh
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.pods[0].name).toBe('stale-pod')
    expect(result.current.error).toBeNull()
  })

  it('sets up polling interval and clears it on unmount', async () => {
    vi.useFakeTimers()
    mockFetchSSE.mockResolvedValue([])

    const { unmount } = renderHook(() => hooks.usePods())

    // Allow the initial fetch (triggered by useEffect) to complete
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    const callsAfterMount = mockFetchSSE.mock.calls.length
    expect(callsAfterMount).toBeGreaterThanOrEqual(1)

    // Advance by one polling interval — should trigger one more call
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
    expect(mockFetchSSE.mock.calls.length).toBeGreaterThan(callsAfterMount)

    unmount()
    const callsAfterUnmount = mockFetchSSE.mock.calls.length

    // No more calls after unmount
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
    expect(mockFetchSSE.mock.calls.length).toBe(callsAfterUnmount)
  })
})

// ============================================================================
// useDeployments
// ============================================================================

describe('useDeployments', () => {
  it('returns initial loading state when no cache exists', () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch

    const { result } = renderHook(() => hooks.useDeployments())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.deployments).toEqual([])
  })

  it('returns deployment data from REST fallback when agent is unavailable', async () => {
    const deploy = makeDeployment()
    mockIsAgentUnavailable.mockReturnValue(true)
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ deployments: [deploy] }),
    }) as typeof fetch

    const { result } = renderHook(() => hooks.useDeployments())

    await waitFor(() => expect(result.current.deployments).toHaveLength(1))
    expect(result.current.deployments[0].name).toBe('deploy-1')
    expect(result.current.isLoading).toBe(false)
  })

  it('passes cluster and namespace params in REST fallback URL', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ deployments: [] }),
    }) as typeof fetch

    renderHook(() => hooks.useDeployments('prod-cluster', 'production'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('cluster=prod-cluster')
    expect(calledUrl).toContain('namespace=production')
  })

  it('clears state and starts loading when cluster changes', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const deploy = makeDeployment({ cluster: 'cluster-a' })
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ deployments: [deploy] }) })
      .mockImplementation(() => new Promise(() => {}))

    const { result, rerender } = renderHook(
      ({ cluster }: { cluster: string }) => hooks.useDeployments(cluster),
      { initialProps: { cluster: 'cluster-a' } },
    )

    await waitFor(() => expect(result.current.deployments).toHaveLength(1))

    // Change cluster — hook resets state
    rerender({ cluster: 'cluster-b' })

    await waitFor(() => expect(result.current.isLoading).toBe(true))
    expect(result.current.deployments).toEqual([])
  })

  it('surfaces error on fetch failure when no cache exists', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('API down')) as typeof fetch

    const { result } = renderHook(() => hooks.useDeployments())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('Failed to fetch deployments')
    })
  })
})

// ============================================================================
// usePodIssues
// ============================================================================

describe('usePodIssues', () => {
  it('returns issues from kubectlProxy.getPodIssues() when cluster is specified and agent is available', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    const issue = {
      name: 'crash-pod',
      namespace: 'default',
      cluster: 'my-cluster',
      status: 'CrashLoopBackOff',
      restarts: 5,
      reason: 'CrashLoopBackOff',
      issues: ['Back-off restarting failed container'],
    }
    mockGetPodIssues.mockResolvedValueOnce([issue])

    const { result } = renderHook(() => hooks.usePodIssues('my-cluster'))

    await waitFor(() => expect(result.current.issues).toHaveLength(1))
    expect(result.current.issues[0].name).toBe('crash-pod')
    expect(result.current.isLoading).toBe(false)
  })

  it('falls back to /api/mcp/pod-issues/stream when kubectlProxy fails', async () => {
    mockIsAgentUnavailable.mockReturnValue(false)
    mockGetPodIssues.mockRejectedValueOnce(new Error('Proxy error'))
    const sseIssue = {
      name: 'sse-pod',
      namespace: 'default',
      cluster: 'my-cluster',
      status: 'OOMKilled',
      restarts: 3,
      issues: ['OOM'],
    }
    mockFetchSSE.mockResolvedValueOnce([sseIssue])

    const { result } = renderHook(() => hooks.usePodIssues('my-cluster'))

    await waitFor(() => expect(result.current.issues).toHaveLength(1))
    expect(mockFetchSSE).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/mcp/pod-issues/stream' }),
    )
    expect(result.current.issues[0].name).toBe('sse-pod')
  })

  it('returns empty issues array on empty SSE response', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockFetchSSE.mockResolvedValueOnce([])

    const { result } = renderHook(() => hooks.usePodIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns error on first fetch failure without cache', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    mockFetchSSE.mockRejectedValueOnce(new Error('Fetch failed'))

    const { result } = renderHook(() => hooks.usePodIssues())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('Failed to fetch pod issues')
      expect(result.current.issues).toEqual([])
    })
  })
})

// ============================================================================
// useDeploymentIssues
// ============================================================================

describe('useDeploymentIssues', () => {
  it('fetches deployment issues from /api/mcp/deployment-issues/stream', async () => {
    const issue = {
      name: 'bad-deploy',
      namespace: 'default',
      cluster: 'test',
      replicas: 3,
      readyReplicas: 1,
      reason: 'Unavailable',
      message: 'Deployment does not have minimum availability',
    }
    mockFetchSSE.mockResolvedValueOnce([issue])

    const { result } = renderHook(() => hooks.useDeploymentIssues())

    await waitFor(() => expect(result.current.issues).toHaveLength(1))
    expect(mockFetchSSE).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/mcp/deployment-issues/stream' }),
    )
    expect(result.current.issues[0].name).toBe('bad-deploy')
    expect(result.current.isLoading).toBe(false)
  })

  it('returns empty issues array on empty SSE response', async () => {
    mockFetchSSE.mockResolvedValueOnce([])

    const { result } = renderHook(() => hooks.useDeploymentIssues())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.issues).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns demo deployment issues on first fetch failure without cache', async () => {
    mockFetchSSE.mockRejectedValueOnce(new Error('SSE failed'))

    const { result } = renderHook(() => hooks.useDeploymentIssues())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      // Falls back to demo data (non-empty)
      expect(result.current.issues.length).toBeGreaterThan(0)
    })
  })

  it('passes cluster and namespace params to fetchSSE', async () => {
    mockFetchSSE.mockResolvedValueOnce([])

    renderHook(() => hooks.useDeploymentIssues('prod-cluster', 'production'))

    await waitFor(() => expect(mockFetchSSE).toHaveBeenCalled())
    expect(mockFetchSSE).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { cluster: 'prod-cluster', namespace: 'production' },
      }),
    )
  })
})

// ============================================================================
// useHPAs
// ============================================================================

describe('useHPAs', () => {
  it('returns hpas from API response', async () => {
    const hpa = {
      name: 'app-hpa',
      namespace: 'default',
      cluster: 'test',
      reference: 'Deployment/app',
      minReplicas: 1,
      maxReplicas: 10,
      currentReplicas: 2,
    }
    mockApiGet.mockResolvedValueOnce({ data: { hpas: [hpa] } })

    const { result } = renderHook(() => hooks.useHPAs())

    await waitFor(() => expect(result.current.hpas).toHaveLength(1))
    expect(result.current.hpas[0].name).toBe('app-hpa')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('returns error on API failure', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('API error'))

    const { result } = renderHook(() => hooks.useHPAs())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('Failed to fetch HPAs')
      expect(result.current.hpas).toEqual([])
    })
  })

  it('passes cluster and namespace when provided', async () => {
    mockApiGet.mockResolvedValueOnce({ data: { hpas: [] } })

    renderHook(() => hooks.useHPAs('prod', 'production'))

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled())
    const urlArg = mockApiGet.mock.calls[0][0] as string
    expect(urlArg).toContain('cluster=prod')
    expect(urlArg).toContain('namespace=production')
  })
})

// ============================================================================
// useJobs
// ============================================================================

describe('useJobs', () => {
  it('returns jobs from SSE response when agent is unavailable', async () => {
    const job = {
      name: 'batch-job',
      namespace: 'default',
      cluster: 'test',
      status: 'Complete',
      completions: '1/1',
    }
    mockFetchSSE.mockResolvedValueOnce([job])

    const { result } = renderHook(() => hooks.useJobs())

    await waitFor(() => expect(result.current.jobs).toHaveLength(1))
    expect(result.current.jobs[0].name).toBe('batch-job')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('returns error on SSE failure', async () => {
    mockFetchSSE.mockRejectedValueOnce(new Error('SSE failed'))

    const { result } = renderHook(() => hooks.useJobs())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('Failed to fetch jobs')
      expect(result.current.jobs).toEqual([])
    })
  })

  it('refetch() re-triggers fetching', async () => {
    mockFetchSSE.mockResolvedValue([])

    const { result } = renderHook(() => hooks.useJobs())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const initialCallCount = mockFetchSSE.mock.calls.length

    await act(async () => { result.current.refetch() })

    await waitFor(() => expect(mockFetchSSE.mock.calls.length).toBeGreaterThan(initialCallCount))
  })
})

// ============================================================================
// useReplicaSets
// ============================================================================

describe('useReplicaSets', () => {
  it('returns replicasets from API response', async () => {
    const rs = {
      name: 'app-rs-abc123',
      namespace: 'default',
      cluster: 'test',
      replicas: 3,
      readyReplicas: 3,
    }
    mockApiGet.mockResolvedValueOnce({ data: { replicasets: [rs] } })

    const { result } = renderHook(() => hooks.useReplicaSets())

    await waitFor(() => expect(result.current.replicasets).toHaveLength(1))
    expect(result.current.replicasets[0].name).toBe('app-rs-abc123')
    expect(result.current.isLoading).toBe(false)
  })

  it('returns error on API failure', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('API error'))

    const { result } = renderHook(() => hooks.useReplicaSets())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('Failed to fetch ReplicaSets')
      expect(result.current.replicasets).toEqual([])
    })
  })
})

// ============================================================================
// useStatefulSets
// ============================================================================

describe('useStatefulSets', () => {
  it('returns statefulsets from API response', async () => {
    const sts = {
      name: 'db-sts',
      namespace: 'default',
      cluster: 'test',
      replicas: 3,
      readyReplicas: 3,
      status: 'Running',
    }
    mockApiGet.mockResolvedValueOnce({ data: { statefulsets: [sts] } })

    const { result } = renderHook(() => hooks.useStatefulSets())

    await waitFor(() => expect(result.current.statefulsets).toHaveLength(1))
    expect(result.current.statefulsets[0].name).toBe('db-sts')
    expect(result.current.isLoading).toBe(false)
  })

  it('returns error on API failure', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('API error'))

    const { result } = renderHook(() => hooks.useStatefulSets())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('Failed to fetch StatefulSets')
      expect(result.current.statefulsets).toEqual([])
    })
  })
})

// ============================================================================
// useDaemonSets
// ============================================================================

describe('useDaemonSets', () => {
  it('returns daemonsets from API response', async () => {
    const ds = {
      name: 'node-agent-ds',
      namespace: 'kube-system',
      cluster: 'test',
      desiredScheduled: 3,
      currentScheduled: 3,
      ready: 3,
      status: 'Running',
    }
    mockApiGet.mockResolvedValueOnce({ data: { daemonsets: [ds] } })

    const { result } = renderHook(() => hooks.useDaemonSets())

    await waitFor(() => expect(result.current.daemonsets).toHaveLength(1))
    expect(result.current.daemonsets[0].name).toBe('node-agent-ds')
    expect(result.current.isLoading).toBe(false)
  })

  it('returns error on API failure', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('API error'))

    const { result } = renderHook(() => hooks.useDaemonSets())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('Failed to fetch DaemonSets')
      expect(result.current.daemonsets).toEqual([])
    })
  })
})

// ============================================================================
// useCronJobs
// ============================================================================

describe('useCronJobs', () => {
  it('returns cronjobs from API response', async () => {
    const cj = {
      name: 'daily-report',
      namespace: 'default',
      cluster: 'test',
      schedule: '0 0 * * *',
      suspend: false,
      active: 0,
    }
    mockApiGet.mockResolvedValueOnce({ data: { cronjobs: [cj] } })

    const { result } = renderHook(() => hooks.useCronJobs())

    await waitFor(() => expect(result.current.cronjobs).toHaveLength(1))
    expect(result.current.cronjobs[0].name).toBe('daily-report')
    expect(result.current.isLoading).toBe(false)
  })

  it('returns error on API failure', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('API error'))

    const { result } = renderHook(() => hooks.useCronJobs())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('Failed to fetch CronJobs')
      expect(result.current.cronjobs).toEqual([])
    })
  })
})

// ============================================================================
// Shared workload cache reset lifecycle
// ============================================================================

describe('shared workload cache reset', () => {
  it('subscribed hooks enter loading state when the shared cache reset fires', async () => {
    // Set up a successful initial fetch so the hook starts with data
    const pod = makePod()
    mockFetchSSE.mockResolvedValue([pod])

    const { result } = renderHook(() => hooks.usePods())

    await waitFor(() => expect(result.current.pods).toHaveLength(1))
    expect(result.current.isLoading).toBe(false)

    // Simulate the cache reset (triggered by mode transition)
    expect(triggerWorkloadsCacheReset).toBeDefined()
    await act(async () => {
      triggerWorkloadsCacheReset!()
    })

    // Hook should re-enter loading state after cache reset
    await waitFor(() => expect(result.current.isLoading).toBe(true))
    expect(result.current.pods).toEqual([])
  })

  it('cache reset clears visible data for subscribed hooks before refetch', async () => {
    const pod = makePod()
    // First fetch succeeds; subsequent fetches never resolve so we can inspect the cleared state
    mockFetchSSE
      .mockResolvedValueOnce([pod])
      .mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => hooks.usePods())

    await waitFor(() => expect(result.current.pods).toHaveLength(1))

    // Trigger cache reset
    expect(triggerWorkloadsCacheReset).toBeDefined()
    await act(async () => {
      triggerWorkloadsCacheReset!()
    })

    // Data should be cleared immediately
    await waitFor(() => {
      expect(result.current.pods).toEqual([])
      expect(result.current.isLoading).toBe(true)
    })
  })
})
