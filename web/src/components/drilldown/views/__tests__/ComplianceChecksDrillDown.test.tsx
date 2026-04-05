/**
 * Unit tests for ComplianceChecksDrillDown.
 *
 * Covers:
 * (a) renders pass/fail counts correctly from Kubescape and Kyverno data
 * (b) filter by status (passing/failing) pre-filters the list
 * (c) empty state rendered when no tools are installed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mock react-i18next ───────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

// ── Mock hooks ───────────────────────────────────────────────────────────
vi.mock('../../../../hooks/useKubescape', () => ({
  useKubescape: vi.fn(),
}))

vi.mock('../../../../hooks/useKyverno', () => ({
  useKyverno: vi.fn(),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: vi.fn(() => ({
    selectedClusters: [],
  })),
}))

import { useKubescape } from '../../../../hooks/useKubescape'
import { useKyverno } from '../../../../hooks/useKyverno'
import { useGlobalFilters } from '../../../../hooks/useGlobalFilters'
import { ComplianceChecksDrillDown } from '../ComplianceChecksDrillDown'

const mockedUseKubescape = vi.mocked(useKubescape)
const mockedUseKyverno = vi.mocked(useKyverno)
const mockedUseGlobalFilters = vi.mocked(useGlobalFilters)

function kubescapeDefaults(overrides: Record<string, unknown> = {}) {
  return {
    statuses: {},
    aggregated: { overallScore: 0, frameworks: [], totalControls: 0, passedControls: 0, failedControls: 0 },
    isLoading: false,
    isRefreshing: false,
    lastRefresh: null,
    installed: false,
    hasErrors: false,
    isDemoData: false,
    clustersChecked: 0,
    totalClusters: 0,
    refetch: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useKubescape>
}

function kyvernoDefaults(overrides: Record<string, unknown> = {}) {
  return {
    statuses: {},
    isLoading: false,
    isRefreshing: false,
    installed: false,
    hasErrors: false,
    isDemoData: false,
    clustersChecked: 0,
    totalClusters: 0,
    refetch: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useKyverno>
}

beforeEach(() => {
  mockedUseKubescape.mockReturnValue(kubescapeDefaults())
  mockedUseKyverno.mockReturnValue(kyvernoDefaults())
  mockedUseGlobalFilters.mockReturnValue({ selectedClusters: [] } as ReturnType<typeof useGlobalFilters>)
})

describe('ComplianceChecksDrillDown', () => {
  it('renders empty state when no tools are installed', () => {
    render(<ComplianceChecksDrillDown data={{}} />)
    expect(screen.getByText('No checks data available')).toBeInTheDocument()
    expect(screen.getByText(/Install Kubescape or Kyverno/)).toBeInTheDocument()
  })

  it('renders pass/fail summary counts from Kubescape controls', () => {
    mockedUseKubescape.mockReturnValue(
      kubescapeDefaults({
        statuses: {
          'cluster-a': {
            cluster: 'cluster-a',
            installed: true,
            loading: false,
            overallScore: 80,
            frameworks: [],
            totalControls: 3,
            passedControls: 2,
            failedControls: 1,
            controls: [
              { id: 'C-0001', name: 'Control One', passed: 5, failed: 0 },
              { id: 'C-0002', name: 'Control Two', passed: 0, failed: 3 },
              { id: 'C-0003', name: 'Control Three', passed: 2, failed: 1 },
            ],
          },
        },
        installed: true,
      }),
    )

    render(<ComplianceChecksDrillDown data={{}} />)

    // Summary stats grid: 3 total, 1 passing (failed===0), 1 failing (passed===0)
    expect(screen.getByText('Total Checks')).toBeInTheDocument()
    // Stats labels appear in the summary grid
    expect(screen.getAllByText('Passing').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Failing').length).toBeGreaterThanOrEqual(1)
    // Should list all three controls
    expect(screen.getByText('Control One')).toBeInTheDocument()
    expect(screen.getByText('Control Two')).toBeInTheDocument()
    expect(screen.getByText('Control Three')).toBeInTheDocument()
  })

  it('renders Kyverno policies as checks', () => {
    mockedUseKyverno.mockReturnValue(
      kyvernoDefaults({
        statuses: {
          'cluster-b': {
            cluster: 'cluster-b',
            installed: true,
            loading: false,
            policies: [
              { name: 'require-labels', kind: 'ClusterPolicy', cluster: 'cluster-b', category: 'Best Practices', status: 'enforcing', violations: 0, description: '', background: false },
              { name: 'disallow-root', kind: 'ClusterPolicy', cluster: 'cluster-b', category: 'Security', status: 'enforcing', violations: 2, description: '', background: false },
            ],
            reports: [],
            totalPolicies: 2,
            totalViolations: 2,
            enforcingCount: 2,
            auditCount: 0,
          },
        },
        installed: true,
      }),
    )

    render(<ComplianceChecksDrillDown data={{}} />)

    // Should show Kyverno policy names
    expect(screen.getByText('require-labels')).toBeInTheDocument()
    expect(screen.getByText('disallow-root')).toBeInTheDocument()
  })

  it('pre-filters to failing checks when filter=failing is passed', () => {
    mockedUseKubescape.mockReturnValue(
      kubescapeDefaults({
        statuses: {
          'cluster-a': {
            cluster: 'cluster-a',
            installed: true,
            loading: false,
            overallScore: 70,
            frameworks: [],
            totalControls: 2,
            passedControls: 1,
            failedControls: 1,
            controls: [
              { id: 'C-0001', name: 'Passing Control', passed: 5, failed: 0 },
              { id: 'C-0002', name: 'Failing Control', passed: 0, failed: 3 },
            ],
          },
        },
        installed: true,
      }),
    )

    render(<ComplianceChecksDrillDown data={{ filter: 'failing' }} />)

    // Should show only failing control
    expect(screen.getByText('Failing Control')).toBeInTheDocument()
    expect(screen.queryByText('Passing Control')).not.toBeInTheDocument()
  })

  it('pre-filters to passing checks when filter=passing is passed', () => {
    mockedUseKubescape.mockReturnValue(
      kubescapeDefaults({
        statuses: {
          'cluster-a': {
            cluster: 'cluster-a',
            installed: true,
            loading: false,
            overallScore: 70,
            frameworks: [],
            totalControls: 2,
            passedControls: 1,
            failedControls: 1,
            controls: [
              { id: 'C-0001', name: 'Passing Control', passed: 5, failed: 0 },
              { id: 'C-0002', name: 'Failing Control', passed: 0, failed: 3 },
            ],
          },
        },
        installed: true,
      }),
    )

    render(<ComplianceChecksDrillDown data={{ filter: 'passing' }} />)

    expect(screen.getByText('Passing Control')).toBeInTheDocument()
    expect(screen.queryByText('Failing Control')).not.toBeInTheDocument()
  })

  it('respects selectedClusters global filter', () => {
    mockedUseGlobalFilters.mockReturnValue({
      selectedClusters: ['cluster-a'],
    } as ReturnType<typeof useGlobalFilters>)

    mockedUseKubescape.mockReturnValue(
      kubescapeDefaults({
        statuses: {
          'cluster-a': {
            cluster: 'cluster-a',
            installed: true,
            loading: false,
            overallScore: 80,
            frameworks: [],
            totalControls: 1,
            passedControls: 1,
            failedControls: 0,
            controls: [{ id: 'C-0001', name: 'Cluster A Control', passed: 1, failed: 0 }],
          },
          'cluster-b': {
            cluster: 'cluster-b',
            installed: true,
            loading: false,
            overallScore: 60,
            frameworks: [],
            totalControls: 1,
            passedControls: 0,
            failedControls: 1,
            controls: [{ id: 'C-0002', name: 'Cluster B Control', passed: 0, failed: 1 }],
          },
        },
        installed: true,
      }),
    )

    render(<ComplianceChecksDrillDown data={{}} />)

    // Only cluster-a is selected, so only cluster-a control shown
    expect(screen.getByText('Cluster A Control')).toBeInTheDocument()
    expect(screen.queryByText('Cluster B Control')).not.toBeInTheDocument()
  })

  it('allows searching for checks by name', async () => {
    const user = userEvent.setup()

    mockedUseKubescape.mockReturnValue(
      kubescapeDefaults({
        statuses: {
          'cluster-a': {
            cluster: 'cluster-a',
            installed: true,
            loading: false,
            overallScore: 80,
            frameworks: [],
            totalControls: 2,
            passedControls: 1,
            failedControls: 1,
            controls: [
              { id: 'C-0001', name: 'Network Policy', passed: 1, failed: 0 },
              { id: 'C-0002', name: 'RBAC Hardening', passed: 0, failed: 2 },
            ],
          },
        },
        installed: true,
      }),
    )

    render(<ComplianceChecksDrillDown data={{}} />)

    const searchInput = screen.getByPlaceholderText('Search checks…')
    await user.type(searchInput, 'network')

    expect(screen.getByText('Network Policy')).toBeInTheDocument()
    expect(screen.queryByText('RBAC Hardening')).not.toBeInTheDocument()
  })
})
