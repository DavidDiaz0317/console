/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import '../../test/utils/setupMocks'

vi.mock('../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ title, subtitle, children, beforeCards }: { title: string; subtitle?: string; children?: React.ReactNode; beforeCards?: React.ReactNode }) => (
    <div data-testid='dashboard-page' data-title={title} data-subtitle={subtitle}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {beforeCards}
      {children}
    </div>
  ),
}))

const mockUseMCPClusters = vi.hoisted(() => vi.fn(() => ({
  clusters: [], isRefreshing: false, refetch: vi.fn(), isLoading: false, error: null,
})))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: (...args: unknown[]) => mockUseMCPClusters(...args),
  useHelmReleases: () => ({ releases: [] }),
  useOperatorSubscriptions: () => ({ subscriptions: [] }),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllHelm: vi.fn(), drillToAllOperators: vi.fn(),
  }),
}))

vi.mock('../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: () => ({ value: 0 }) }),
  createMergedStatValueGetter: () => () => ({ value: 0 }),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn() },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { GitOps } from './GitOps'

describe('GitOps Component', () => {
  const renderGitOps = () =>
    render(
      <MemoryRouter>
        <GitOps />
      </MemoryRouter>
    )

  it('renders without crashing', () => {
    expect(() => renderGitOps()).not.toThrow()
  })

  it('renders the DashboardPage with correct title', () => {
    renderGitOps()
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument()
    expect(screen.getByText('gitops.title')).toBeInTheDocument()
  })

  it('renders the applications section', () => {
    renderGitOps()
    expect(screen.getByText('gitops.applications')).toBeInTheDocument()
  })

  it('renders the integration info section', () => {
    renderGitOps()
    expect(screen.getByText('gitops.integrationTitle')).toBeInTheDocument()
  })

  it('renders gracefully during loading state', () => {
    mockUseMCPClusters.mockReturnValueOnce({ clusters: [], isRefreshing: true, refetch: vi.fn(), isLoading: true, error: null })
    expect(() => renderGitOps()).not.toThrow()
  })

  it('renders gracefully when cluster fetch errors', () => {
    mockUseMCPClusters.mockReturnValueOnce({ clusters: [], isRefreshing: false, refetch: vi.fn(), isLoading: false, error: 'Connection refused' })
    expect(() => renderGitOps()).not.toThrow()
  })
})
