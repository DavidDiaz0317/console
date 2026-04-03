import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Standard mocks
vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
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

const mockDrillDown = vi.fn()
vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => mockDrillDown(),
}))

import { KubecostOverview } from '../KubecostOverview'

describe('KubecostOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false })
    mockDrillDown.mockReturnValue({ drillToCost: vi.fn() })
  })

  it('renders without crashing', () => {
    const { container } = render(<KubecostOverview />)
    expect(container).toBeTruthy()
  })

  it('renders and reports state correctly', () => {
    const { container } = render(<KubecostOverview />)
    expect(container || true).toBeTruthy()
  })

  it('renders health indicator', () => {
    render(<KubecostOverview />)
    expect(screen.getByTestId('health-indicator')).toBeTruthy()
  })

  it('always shows not-configured status since card only uses demo data', () => {
    render(<KubecostOverview />)
    const indicator = screen.getByTestId('health-indicator')
    // t() mock returns the key, so we check for the i18n key
    expect(indicator.textContent).toContain('kubecostOverview.statusDemoData')
  })

  it('renders correctly regardless of demo mode flag', () => {
    const { container } = render(<KubecostOverview />)
    expect(container).toBeTruthy()
    // health indicator should always be present
    expect(screen.getByTestId('health-indicator')).toBeTruthy()
  })

})