import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsOverview } from './StatsOverview'

vi.mock('../../hooks/useDashboardHealth', () => ({
  useDashboardHealth: () => ({
    status: 'warning',
    message: '1 warning',
    details: ['1 cluster degraded'],
    criticalCount: 0,
    warningCount: 1,
    navigateTo: '/alerts',
  }),
}))

vi.mock('../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ status: 'connected' }),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../../hooks/useBackendHealth', () => ({
  isInClusterMode: () => false,
}))

vi.mock('../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

vi.mock('../../hooks/useStatHistory', () => ({
  useStatHistory: () => ({ getHistory: () => [] }),
  MIN_SPARKLINE_POINTS: 3,
}))

vi.mock('./StatsConfig', () => ({
  StatsConfigModal: () => null,
  useStatsConfig: () => ({
    blocks: [],
    saveBlocks: vi.fn(),
    visibleBlocks: [],
    defaultBlocks: [],
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

describe('StatsOverview Component', () => {
  it('exports StatsOverview component', () => {
    expect(StatsOverview).toBeDefined()
    expect(typeof StatsOverview).toBe('function')
  })

  it('shows health indicator when showHealthIndicator is true', () => {
    render(
      <StatsOverview
        dashboardType="main"
        getStatValue={() => ({ value: 0 })}
        showHealthIndicator={true}
      />
    )
    expect(screen.getByLabelText('System health: 1 warning')).toBeInTheDocument()
  })

  it('does not show health indicator by default', () => {
    render(
      <StatsOverview
        dashboardType="main"
        getStatValue={() => ({ value: 0 })}
      />
    )
    expect(screen.queryByLabelText('System health: 1 warning')).not.toBeInTheDocument()
  })
})
