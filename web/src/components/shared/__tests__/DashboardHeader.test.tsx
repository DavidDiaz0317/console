import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../hooks/useLastRoute', () => ({
  getRememberPosition: vi.fn(),
  setRememberPosition: vi.fn(),
}))

import { DashboardHeader } from '../DashboardHeader'

describe('DashboardHeader', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter>
        <DashboardHeader title="Test" subtitle="Sub" isFetching={false} onRefresh={vi.fn()} />
      </MemoryRouter>
    )
    expect(container).toBeTruthy()
  })

  it('renders title and subtitle', () => {
    render(
      <MemoryRouter>
        <DashboardHeader title="GPU Dashboard" subtitle="Cluster GPU overview" isFetching={false} onRefresh={vi.fn()} />
      </MemoryRouter>
    )
    expect(screen.getByTestId('dashboard-title')).toBeTruthy()
    expect(screen.getByText('GPU Dashboard')).toBeTruthy()
  })

  it('renders health indicator when provided via afterTitle', () => {
    const HealthBadge = () => (
      <span data-testid="health-badge" className="text-green-400">All systems healthy</span>
    )
    render(
      <MemoryRouter>
        <DashboardHeader
          title="Test Dashboard"
          subtitle="Sub"
          isFetching={false}
          onRefresh={vi.fn()}
          afterTitle={<HealthBadge />}
        />
      </MemoryRouter>
    )
    expect(screen.getByTestId('health-badge')).toBeTruthy()
    expect(screen.getByText('All systems healthy')).toBeTruthy()
  })

  it('shows updating indicator while fetching', () => {
    render(
      <MemoryRouter>
        <DashboardHeader title="Test" subtitle="Sub" isFetching={true} onRefresh={vi.fn()} />
      </MemoryRouter>
    )
    const updatingEl = screen.getByTitle('Updating...')
    expect(updatingEl).toBeTruthy()
  })

  it('shows error health alert when error prop is provided', () => {
    render(
      <MemoryRouter>
        <DashboardHeader
          title="Test"
          subtitle="Sub"
          isFetching={false}
          onRefresh={vi.fn()}
          error="Failed to fetch cluster data"
        />
      </MemoryRouter>
    )
    expect(screen.getByText('Failed to fetch cluster data')).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
