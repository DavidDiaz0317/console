import { vi } from 'vitest'

// Mock the cache module using the same alias as the hook
vi.mock('@/lib/cache', async (importOriginal) => {
    const actual = await importOriginal() as any
    return {
        ...actual,
        useCache: vi.fn().mockImplementation((options) => {
            return {
                data: options.demoData,
                isLoading: false,
                isRefreshing: false,
                isDemoFallback: true,
                error: null,
                isFailed: false,
                consecutiveFailures: 0,
                lastRefresh: Date.now(),
                refetch: vi.fn(),
            }
        }),
    }
})

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCachedThanosStatus } from '../useCachedThanosStatus'

describe('useCachedThanosStatus Hook', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('provides the correct hook interface', () => {
        const { result } = renderHook(() => useCachedThanosStatus())

        expect(result.current).toHaveProperty('data')
        expect(result.current).toHaveProperty('isLoading')
        expect(result.current).toHaveProperty('isDemoFallback')
        expect(result.current.isDemoFallback).toBe(true)
    })

    it('initializes with mock data', () => {
        const { result } = renderHook(() => useCachedThanosStatus())
        expect(result.current.data.targets.length).toBeGreaterThan(0)
        expect(result.current.data.storeGateways.length).toBeGreaterThan(0)
    })
})
