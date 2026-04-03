/**
 * StatsOverview Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ status: 'connected' }),
}))

vi.mock('../../../../hooks/useBackendHealth', () => ({
  isInClusterMode: () => false,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../../../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

vi.mock('../../../ui/StatsConfig', () => ({
  StatsConfigModal: () => null,
  useStatsConfig: () => ({
    blocks: [
      { id: 'clusters', color: 'purple', icon: 'Server' },
      { id: 'healthy', color: 'green', icon: 'CheckCircle2' },
      { id: 'unhealthy', color: 'red', icon: 'XCircle' },
      { id: 'unreachable', color: 'yellow', icon: 'WifiOff' },
    ],
    saveBlocks: vi.fn(),
    visibleBlocks: [
      { id: 'clusters', color: 'purple', icon: 'Server' },
      { id: 'healthy', color: 'green', icon: 'CheckCircle2' },
      { id: 'unhealthy', color: 'red', icon: 'XCircle' },
      { id: 'unreachable', color: 'yellow', icon: 'WifiOff' },
    ],
    defaultBlocks: [],
  }),
}))

vi.mock('../../../shared/TechnicalAcronym', () => ({
  wrapAbbreviations: (text: string) => text,
}))

/** Timeout for importing heavy modules */
const IMPORT_TIMEOUT_MS = 30000

const MOCK_STATS = {
  total: 5,
  loading: 0,
  healthy: 3,
  unhealthy: 1,
  unreachable: 1,
  totalNodes: 15,
  totalCPUs: 60,
  totalMemoryGB: 240,
  totalStorageGB: 1000,
  totalPods: 150,
  totalGPUs: 8,
  allocatedGPUs: 6,
  hasResourceData: true,
}

describe('StatsOverview', () => {
  it('exports StatsOverview component', async () => {
    const mod = await import('../StatsOverview')
    expect(mod.StatsOverview).toBeDefined()
    expect(typeof mod.StatsOverview).toBe('function')
  }, IMPORT_TIMEOUT_MS)

  it('renders health indicator stat blocks', async () => {
    const { StatsOverview } = await import('../StatsOverview')
    render(<StatsOverview stats={MOCK_STATS} />)
    // Healthy label block
    expect(screen.getByText('Healthy')).toBeTruthy()
    // Unhealthy label block
    expect(screen.getByText('Unhealthy')).toBeTruthy()
    // Offline (unreachable) label block
    expect(screen.getByText('Offline')).toBeTruthy()
  }, IMPORT_TIMEOUT_MS)

  it('shows correct healthy cluster count', async () => {
    const { StatsOverview } = await import('../StatsOverview')
    render(<StatsOverview stats={MOCK_STATS} />)
    // The "Healthy" label and its count should be in the same stat block container
    const healthyLabel = screen.getByText('Healthy')
    const statBlock = healthyLabel.closest('div')?.parentElement
    expect(statBlock?.textContent).toContain('3')
  }, IMPORT_TIMEOUT_MS)

  it('shows correct unhealthy cluster count', async () => {
    const { StatsOverview } = await import('../StatsOverview')
    render(<StatsOverview stats={MOCK_STATS} />)
    // The "Unhealthy" label and its count should be in the same stat block container
    const unhealthyLabel = screen.getByText('Unhealthy')
    const statBlock = unhealthyLabel.closest('div')?.parentElement
    expect(statBlock?.textContent).toContain('1')
  }, IMPORT_TIMEOUT_MS)
})
