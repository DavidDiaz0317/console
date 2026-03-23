import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockUseCache,
  mockIsDemoMode,
} = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
  mockIsDemoMode: vi.fn(() => false),
}))

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../lib/llmd/benchmarkMockData', () => ({
  generateBenchmarkReports: () => [{ id: 'demo-1' }],
  getHardwareShort: (s: string) => s,
  getModelShort: (s: string) => s,
  CONFIG_COLORS: {},
}))

vi.mock('../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'token',
}))

vi.mock('../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
}))

// Mock fetch globally to prevent real network calls from the SSE stream
const mockFetch = vi.fn().mockRejectedValue(new Error('no network in test'))
vi.stubGlobal('fetch', mockFetch)

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { useCachedBenchmarkReports } from './useBenchmarkData'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCacheResult(data: unknown = [], overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCachedBenchmarkReports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode.mockReturnValue(false)
    mockUseCache.mockImplementation(() => defaultCacheResult())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not set demoWhenEmpty in non-demo mode', () => {
    mockIsDemoMode.mockReturnValue(false)
    let capturedOptions: Record<string, unknown> | undefined
    mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
      capturedOptions = opts
      return defaultCacheResult([])
    })

    renderHook(() => useCachedBenchmarkReports())

    expect(capturedOptions?.demoWhenEmpty).toBe(false)
  })

  it('sets demoWhenEmpty when demo mode is explicitly enabled', () => {
    mockIsDemoMode.mockReturnValue(true)
    let capturedOptions: Record<string, unknown> | undefined
    mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
      capturedOptions = opts
      return defaultCacheResult([], { isDemoFallback: true })
    })

    renderHook(() => useCachedBenchmarkReports())

    expect(capturedOptions?.demoWhenEmpty).toBe(true)
  })

  it('does not report isDemoFallback when cache has no live data in non-demo mode', () => {
    mockIsDemoMode.mockReturnValue(false)
    mockUseCache.mockImplementation(() => defaultCacheResult([], {
      isDemoFallback: false,
    }))

    const { result } = renderHook(() => useCachedBenchmarkReports())

    expect(result.current.isDemoFallback).toBe(false)
    expect(result.current.data).toEqual([])
  })

  it('returns live error state without demo data injection in non-demo mode', () => {
    mockIsDemoMode.mockReturnValue(false)
    mockUseCache.mockImplementation(() => defaultCacheResult([], {
      isFailed: true,
      error: new Error('Benchmark API error: 500'),
      isDemoFallback: false,
    }))

    const { result } = renderHook(() => useCachedBenchmarkReports())

    expect(result.current.isDemoFallback).toBe(false)
    expect(result.current.isFailed).toBe(true)
    expect(result.current.data).toEqual([])
  })

  it('reports isDemoFallback when cache falls back to demo and not loading', () => {
    mockIsDemoMode.mockReturnValue(true)
    const demoData = [{ id: 'demo-1' }]
    mockUseCache.mockImplementation(() => defaultCacheResult(demoData, {
      isDemoFallback: true,
      isLoading: false,
    }))

    const { result } = renderHook(() => useCachedBenchmarkReports())

    expect(result.current.isDemoFallback).toBe(true)
    expect(result.current.data).toEqual(demoData)
  })

  it('does not report isDemoFallback while still loading', () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseCache.mockImplementation(() => defaultCacheResult([], {
      isDemoFallback: true,
      isLoading: true,
    }))

    const { result } = renderHook(() => useCachedBenchmarkReports())

    // isDemoFallback should be suppressed during loading
    expect(result.current.isDemoFallback).toBe(false)
  })

  it('passes correct cache key and category', () => {
    let capturedOptions: Record<string, unknown> | undefined
    mockUseCache.mockImplementation((opts: Record<string, unknown>) => {
      capturedOptions = opts
      return defaultCacheResult([])
    })

    renderHook(() => useCachedBenchmarkReports())

    expect(capturedOptions?.key).toBe('benchmark-reports')
    expect(capturedOptions?.category).toBe('costs')
  })

  it('exposes streaming metadata from the hook', () => {
    mockUseCache.mockImplementation(() => defaultCacheResult([]))

    const { result } = renderHook(() => useCachedBenchmarkReports())

    expect(result.current).toHaveProperty('isStreaming')
    expect(result.current).toHaveProperty('streamProgress')
    expect(result.current).toHaveProperty('streamStatus')
    expect(result.current).toHaveProperty('currentSince')
  })
})
