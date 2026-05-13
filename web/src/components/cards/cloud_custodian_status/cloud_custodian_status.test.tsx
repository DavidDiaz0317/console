import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { CloudCustodianStatus } from './index'

const mockUseCachedCloudCustodian = vi.fn()
const mockUseCardLoadingState = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../hooks/useCachedCloudCustodian', () => ({
  useCachedCloudCustodian: (...args: unknown[]) => mockUseCachedCloudCustodian(...args),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonList: () => <div data-testid="skeleton-list" />,
  SkeletonStats: () => <div data-testid="skeleton-stats" />,
}))

function setup(overrides?: Record<string, unknown>) {
  mockUseCachedCloudCustodian.mockReturnValue({
    data: {
      health: 'not-installed',
      version: '0.9.0',
      policies: [],
      topResources: [],
      violationsBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      summary: {
        totalPolicies: 0,
        successfulPolicies: 0,
        failedPolicies: 0,
        dryRunPolicies: 0,
      },
      lastCheckTime: new Date().toISOString(),
    },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    ...overrides,
  })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
}

describe('CloudCustodianStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when loading', () => {
    setup({ isLoading: true })
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: true, showEmptyState: false })
    render(<CloudCustodianStatus />)

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })
})
