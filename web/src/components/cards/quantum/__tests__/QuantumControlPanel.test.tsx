import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { QuantumAuthStatus, QuantumSystemStatus } from '../../../../hooks/useCachedQuantum'

const mockUseQuantumSystemStatus = vi.fn()
const mockUseQuantumAuthStatus = vi.fn()

vi.mock('../../../../hooks/useCachedQuantum', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useCachedQuantum')>()
  return {
    ...actual,
    useQuantumSystemStatus: (opts: Parameters<typeof actual.useQuantumSystemStatus>[0]) =>
      mockUseQuantumSystemStatus(opts),
    useQuantumAuthStatus: (opts: Parameters<typeof actual.useQuantumAuthStatus>[0]) =>
      mockUseQuantumAuthStatus(opts),
  }
})

vi.mock('../../../../lib/demoMode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/demoMode')>()
  return {
    ...actual,
    isQuantumForcedToDemo: vi.fn(() => false),
  }
})

const mockUseAuth = vi.fn()
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockOpenDrillDown = vi.fn()
const mockCloseDrillDown = vi.fn()
vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDown: () => ({
    open: mockOpenDrillDown,
    close: mockCloseDrillDown,
  }),
}))

vi.mock('../../../../hooks/useQASMFiles', () => ({
  useQASMFiles: () => ({
    files: [{ name: 'bell.qasm' }],
    isLoading: false,
    error: null,
  }),
}))

import { QuantumControlPanel } from '../QuantumControlPanel'
import { DEMO_QUANTUM_STATUS } from '../../../../hooks/useCachedQuantum'

function defaultAuthReturn(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    token: null,
    ...overrides,
  }
}

function statusHookReturn(
  overrides: Partial<{
    data: QuantumSystemStatus | null
    isLoading: boolean
    isRefreshing: boolean
    isDemoData: boolean
    error: string | null
    isFailed: boolean
    consecutiveFailures: number
    lastRefresh: number | null
    refetch: () => Promise<void>
  }> = {},
) {
  return {
    data: DEMO_QUANTUM_STATUS,
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    ...overrides,
  }
}

function authHookReturn(
  overrides: Partial<{
    data: QuantumAuthStatus
    isLoading: boolean
    isRefreshing: boolean
    isDemoData: boolean
    error: string | null
    isFailed: boolean
    consecutiveFailures: number
    lastRefresh: number | null
    refetch: () => Promise<void>
  }> = {},
) {
  return {
    data: { authenticated: false } as QuantumAuthStatus,
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('QuantumControlPanel — auth-status polling gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue(defaultAuthReturn())
    mockUseQuantumSystemStatus.mockReturnValue(statusHookReturn())
    mockUseQuantumAuthStatus.mockReturnValue(authHookReturn())
  })

  it('passes autoRefresh: false to auth-status hook when default backend is aer', () => {
    render(<QuantumControlPanel />)
    expect(mockUseQuantumAuthStatus).toHaveBeenCalled()
    const lastCall = mockUseQuantumAuthStatus.mock.calls.at(-1)?.[0]
    expect(lastCall?.autoRefresh).toBe(false)
  })

  it('passes autoRefresh: true once user selects an IBM backend (qx5)', () => {
    const { container } = render(<QuantumControlPanel />)
    const select = container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'qx5' } })
    const lastCall = mockUseQuantumAuthStatus.mock.calls.at(-1)?.[0]
    expect(lastCall?.autoRefresh).toBe(true)
  })
})

describe('QuantumControlPanel — error classification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue(defaultAuthReturn())
    mockUseQuantumSystemStatus.mockReturnValue(statusHookReturn())
  })

  it('renders the soft yellow transient banner (not red) for retryable IBM errors when on an IBM backend', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({ error: 'max retries attempted; service unavailable' }),
    )
    const { container } = render(<QuantumControlPanel />)
    const select = container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'qx5' } })

    expect(
      screen.getByText('quantumControlPanel.ibmUpstreamUnavailable'),
    ).toBeInTheDocument()
    // The classified-transient error must NOT also surface in the red banner.
    expect(screen.queryByText(/max retries attempted/i)).toBeNull()
  })

  it('renders the red banner for fatal (non-retryable) auth errors', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({ error: 'invalid api key' }),
    )
    const { container } = render(<QuantumControlPanel />)
    const select = container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'qx5' } })

    expect(screen.getByText('invalid api key')).toBeInTheDocument()
    expect(
      screen.queryByText('quantumControlPanel.ibmUpstreamUnavailable'),
    ).toBeNull()
  })

  it('does not render the transient banner on a non-IBM backend even if the cached error is transient', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({ error: 'service unavailable 503' }),
    )
    render(<QuantumControlPanel />)

    expect(
      screen.queryByText('quantumControlPanel.ibmUpstreamUnavailable'),
    ).toBeNull()
  })

  it('does not render the red banner on a non-IBM backend even if the cached auth error is fatal', () => {
    // A stale 401 from a prior IBM-backed validation must not surface in the
    // red banner once the user is on aer/sim doing purely local work.
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({ error: 'invalid api key' }),
    )
    render(<QuantumControlPanel />)

    expect(screen.queryByText('invalid api key')).toBeNull()
  })
})

describe('QuantumControlPanel — three-state credentials badge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue(defaultAuthReturn())
    mockUseQuantumSystemStatus.mockReturnValue(statusHookReturn())
  })

  it('shows "Not configured" key when there is no token and no historical validation', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({ data: { authenticated: false }, lastRefresh: null }),
    )
    render(<QuantumControlPanel />)
    expect(screen.getByText('quantumControlPanel.credsNone')).toBeInTheDocument()
  })

  it('shows "Stored" key when cache has a historical successful validation but session has not re-confirmed', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: { authenticated: false },
        lastRefresh: Date.now() - 60_000,
      }),
    )
    render(<QuantumControlPanel />)
    expect(screen.getByText('quantumControlPanel.credsStored')).toBeInTheDocument()
  })

  it('shows "Configured" key once the session observes authenticated:true', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: { authenticated: true },
        lastRefresh: Date.now(),
      }),
    )
    render(<QuantumControlPanel />)
    expect(screen.getByText('quantumControlPanel.credsConfigured')).toBeInTheDocument()
  })

  it('renders a Validate-now button when the badge is in Stored state', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: { authenticated: false },
        lastRefresh: Date.now() - 60_000,
      }),
    )
    render(<QuantumControlPanel />)
    expect(screen.getByLabelText('quantumControlPanel.validateNow')).toBeInTheDocument()
  })

  it('does not render a Validate-now button when the badge is Configured', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: { authenticated: true },
        lastRefresh: Date.now(),
      }),
    )
    render(<QuantumControlPanel />)
    expect(screen.queryByLabelText('quantumControlPanel.validateNow')).toBeNull()
  })
})
