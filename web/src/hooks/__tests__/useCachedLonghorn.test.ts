import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseCache, mockAuthFetch } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
  mockAuthFetch: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook: (config: Record<string, unknown>) => {
    return () => {
      const result = mockUseCache(config)
      return {
        data: result.data,
        isLoading: result.isLoading,
        isRefreshing: result.isRefreshing,
        isDemoFallback: result.isDemoFallback && !result.isLoading,
        error: result.error,
        isFailed: result.isFailed,
        consecutiveFailures: result.consecutiveFailures,
        lastRefresh: result.lastRefresh,
        refetch: result.refetch,
      }
    }
  },
}))

vi.mock('../../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
}))

import { useCachedLonghorn, __testables } from '../useCachedLonghorn'

const { normalizeVolumeState, normalizeRobustness, summarize, deriveHealth, buildStatus } = __testables

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCacheResult(data: unknown = null) {
  return {
    data,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseCache.mockReturnValue(defaultCacheResult())
})

// ---------------------------------------------------------------------------
// Hook-level tests
// ---------------------------------------------------------------------------

describe('useCachedLonghorn hook', () => {
  it('renders without error', () => {
    const { result } = renderHook(() => useCachedLonghorn())
    expect(result.current).toBeDefined()
  })

  it('returns standard CachedHookResult shape', () => {
    const { result } = renderHook(() => useCachedLonghorn())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('refetch')
  })

  it('passes correct cache key', () => {
    renderHook(() => useCachedLonghorn())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'longhorn-status' })
    )
  })

  it('suppresses isDemoFallback during loading', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheResult(),
      isDemoFallback: true,
      isLoading: true,
    })
    const { result } = renderHook(() => useCachedLonghorn())
    expect(result.current.isDemoFallback).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe('normalizeVolumeState', () => {
  it('normalizes valid states', () => {
    expect(normalizeVolumeState('attached')).toBe('attached')
    expect(normalizeVolumeState('detached')).toBe('detached')
    expect(normalizeVolumeState('attaching')).toBe('attaching')
  })

  it('returns "unknown" for invalid state', () => {
    expect(normalizeVolumeState('bogus')).toBe('unknown')
  })

  it('returns "unknown" for undefined', () => {
    expect(normalizeVolumeState(undefined)).toBe('unknown')
  })
})

describe('normalizeRobustness', () => {
  it('normalizes valid robustness values', () => {
    expect(normalizeRobustness('healthy')).toBe('healthy')
    expect(normalizeRobustness('degraded')).toBe('degraded')
    expect(normalizeRobustness('faulted')).toBe('faulted')
  })

  it('returns "unknown" for invalid value', () => {
    expect(normalizeRobustness('invalid')).toBe('unknown')
  })
})

describe('summarize', () => {
  it('returns zero counts for empty volumes and nodes', () => {
    const result = summarize([], [])
    expect(result.totalVolumes).toBe(0)
    expect(result.totalNodes).toBe(0)
    expect(result.healthyVolumes).toBe(0)
  })

  it('counts volume health states correctly', () => {
    const volumes = [
      { name: 'v1', state: 'attached' as const, robustness: 'healthy' as const, size: 1073741824, numberOfReplicas: 3, replicas: [] },
      { name: 'v2', state: 'attached' as const, robustness: 'degraded' as const, size: 1073741824, numberOfReplicas: 3, replicas: [] },
      { name: 'v3', state: 'detached' as const, robustness: 'faulted' as const, size: 1073741824, numberOfReplicas: 3, replicas: [] },
    ]
    const result = summarize(volumes, [])
    expect(result.totalVolumes).toBe(3)
    expect(result.healthyVolumes).toBe(1)
    expect(result.degradedVolumes).toBe(1)
    expect(result.faultedVolumes).toBe(1)
  })

  it('counts node readiness correctly', () => {
    const nodes = [
      { name: 'n1', ready: true, schedulable: true, disks: {}, storageCapacity: 0, storageUsed: 0 },
      { name: 'n2', ready: false, schedulable: true, disks: {}, storageCapacity: 0, storageUsed: 0 },
    ]
    const result = summarize([], nodes)
    expect(result.totalNodes).toBe(2)
    expect(result.readyNodes).toBe(1)
  })
})

describe('deriveHealth', () => {
  it('returns not-installed for empty summary', () => {
    const summary = {
      totalVolumes: 0, healthyVolumes: 0, degradedVolumes: 0, faultedVolumes: 0,
      totalNodes: 0, readyNodes: 0, schedulableNodes: 0,
      totalCapacityBytes: 0, totalUsedBytes: 0,
    }
    expect(deriveHealth(summary)).toBe('not-installed')
  })

  it('returns healthy when all volumes are healthy', () => {
    const summary = {
      totalVolumes: 3, healthyVolumes: 3, degradedVolumes: 0, faultedVolumes: 0,
      totalNodes: 2, readyNodes: 2, schedulableNodes: 2,
      totalCapacityBytes: 100, totalUsedBytes: 50,
    }
    expect(deriveHealth(summary)).toBe('healthy')
  })

  it('returns degraded when some volumes are degraded', () => {
    const summary = {
      totalVolumes: 3, healthyVolumes: 2, degradedVolumes: 1, faultedVolumes: 0,
      totalNodes: 2, readyNodes: 2, schedulableNodes: 2,
      totalCapacityBytes: 100, totalUsedBytes: 50,
    }
    expect(deriveHealth(summary)).toBe('degraded')
  })

  it('returns critical when volumes are faulted', () => {
    const summary = {
      totalVolumes: 3, healthyVolumes: 1, degradedVolumes: 1, faultedVolumes: 1,
      totalNodes: 2, readyNodes: 2, schedulableNodes: 2,
      totalCapacityBytes: 100, totalUsedBytes: 50,
    }
    expect(deriveHealth(summary)).toBe('critical')
  })
})

describe('buildStatus', () => {
  it('returns not-installed for null response', () => {
    const result = buildStatus(null)
    expect(result.health).toBe('not-installed')
  })

  it('returns not-installed for empty response', () => {
    const result = buildStatus({ volumes: [], nodes: [] })
    expect(result.health).toBe('not-installed')
  })
})
