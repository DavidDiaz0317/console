import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { CniStatus } from './index'

const mockUseCachedCni = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../hooks/useCachedCni', () => ({
  useCachedCni: () => mockUseCachedCni(),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonList: () => <div data-testid="skeleton-list" />,
  SkeletonStats: () => <div data-testid="skeleton-stats" />,
}))

function setup(overrides?: Record<string, unknown>) {
  mockUseCachedCni.mockReturnValue({
    plugin: null,
    nodeStatus: [],
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    refetch: vi.fn(),
    ...overrides,
  })
}

describe('CniStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading skeleton when isLoading is true', () => {
    setup({ isLoading: true })
    render(<CniStatus />)

    expect(screen.getByTestId('skeleton')).toBeTruthy()
  })

  it('renders with empty state when no CNI plugin found', () => {
    setup({ plugin: null, nodeStatus: [] })
    render(<CniStatus />)

    // Component should render without error
    expect(screen.queryByTestId('skeleton')).toBeFalsy()
  })
})
