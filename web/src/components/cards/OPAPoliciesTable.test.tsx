import type { ChangeEvent, ComponentProps, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OPAPoliciesTable } from './OPAPoliciesTable'
import type { ClusterWithHealth } from '../../lib/cards/cardFilters'
import type { GatekeeperStatus, OPAClusterItem, Policy } from './opa'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const parts = key.split('.')
      return parts[parts.length - 1]
    },
  }),
}))

type SearchInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

type ControlsRowProps = {
  extra?: ReactNode
}

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange, placeholder }: SearchInputProps) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  ),
  CardControlsRow: ({ extra }: ControlsRowProps) => <div data-testid="card-controls">{extra}</div>,
  CardPaginationFooter: () => <div data-testid="pagination-footer" />,
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <span data-testid="status-badge">{children}</span>,
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => <span data-testid="refresh-indicator" />,
}))

type OPAPoliciesTableProps = ComponentProps<typeof OPAPoliciesTable>

function makeCluster(name: string, overrides: Partial<OPAClusterItem> = {}): OPAClusterItem {
  return {
    name,
    cluster: name,
    healthy: true,
    reachable: true,
    ...overrides,
  }
}

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    name: 'require-labels',
    kind: 'K8sRequiredLabels',
    violations: 0,
    mode: 'warn',
    ...overrides,
  }
}

function makeStatus(cluster: string, overrides: Partial<GatekeeperStatus> = {}): GatekeeperStatus {
  return {
    cluster,
    installed: true,
    policyCount: 2,
    violationCount: 0,
    mode: 'warn',
    modes: ['warn'],
    loading: false,
    policies: [],
    violations: [],
    ...overrides,
  }
}

function createDefaultProps(overrides?: Partial<OPAPoliciesTableProps>): OPAPoliciesTableProps {
  return {
    installedCount: 0,
    activePolicies: 0,
    totalViolations: 0,
    isRefreshing: false,
    lastRefresh: null,
    containerRef: { current: null },
    containerStyle: undefined,
    paginatedClusters: [],
    totalItems: 0,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 10,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
    statuses: {},
    search: '',
    setSearch: vi.fn(),
    availableClusters: [] as ClusterWithHealth[],
    localClusterFilter: [],
    toggleClusterFilter: vi.fn(),
    clearClusterFilter: vi.fn(),
    showClusterFilter: false,
    setShowClusterFilter: vi.fn(),
    clusterFilterRef: { current: null },
    sorting: {
      sortBy: 'name',
      setSortBy: vi.fn(),
      sortDirection: 'asc',
      setSortDirection: vi.fn(),
    },
    onShowViolations: vi.fn(),
    onInstallOPA: vi.fn(),
    onPolicyClick: vi.fn(),
    onCreatePolicy: vi.fn(),
    ...overrides,
  }
}

describe('OPAPoliciesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders healthy installed rows for online clusters', () => {
    const clusters = [makeCluster('alpha'), makeCluster('beta')]
    const { container } = render(
      <OPAPoliciesTable
        {...createDefaultProps({
          installedCount: 2,
          activePolicies: 5,
          totalViolations: 0,
          paginatedClusters: clusters,
          totalItems: clusters.length,
          statuses: {
            alpha: makeStatus('alpha', { policyCount: 2, modes: ['warn'] }),
            beta: makeStatus('beta', { policyCount: 3, modes: ['enforce'] }),
          },
        })}
      />,
    )

    expect(screen.getByTestId('status-badge')).toHaveTextContent('2 clusters')
    expect(screen.getByText('Policies Active')).toBeInTheDocument()
    expect(screen.getByText('Violations')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /alpha/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /beta/i })).toBeEnabled()
    expect(container.querySelectorAll('svg.lucide-check-circle')).toHaveLength(2)
  })

  it('shows an offline indicator and disables the cluster row when a cluster is unreachable', () => {
    render(
      <OPAPoliciesTable
        {...createDefaultProps({
          paginatedClusters: [makeCluster('offline-cluster', { reachable: false })],
          totalItems: 1,
        })}
      />,
    )

    expect(screen.getByText('offline')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /offline-cluster/i })).toBeDisabled()
  })

  it('shows not installed text for clusters without Gatekeeper installed', () => {
    render(
      <OPAPoliciesTable
        {...createDefaultProps({
          paginatedClusters: [makeCluster('worker-a')],
          totalItems: 1,
          statuses: {
            'worker-a': makeStatus('worker-a', { installed: false, policyCount: undefined, modes: undefined }),
          },
        })}
      />,
    )

    expect(screen.getByText('Not installed')).toBeInTheDocument()
  })

  it('shows violations text and opens the violations drilldown when an installed row is clicked', async () => {
    const user = userEvent.setup()
    const onShowViolations = vi.fn()

    render(
      <OPAPoliciesTable
        {...createDefaultProps({
          installedCount: 1,
          totalViolations: 3,
          paginatedClusters: [makeCluster('violating-cluster')],
          totalItems: 1,
          statuses: {
            'violating-cluster': makeStatus('violating-cluster', { violationCount: 3 }),
          },
          onShowViolations,
        })}
      />,
    )

    expect(screen.getByText('3 violations')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /violating-cluster/i }))
    expect(onShowViolations).toHaveBeenCalledWith('violating-cluster')
  })

  it('calls onCreatePolicy when the footer button is clicked', async () => {
    const user = userEvent.setup()
    const onCreatePolicy = vi.fn()

    render(<OPAPoliciesTable {...createDefaultProps({ onCreatePolicy })} />)

    await user.click(screen.getByText('Create Policy'))
    expect(onCreatePolicy).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state when there are no clusters', () => {
    render(<OPAPoliciesTable {...createDefaultProps()} />)

    expect(screen.getByText('No clusters available')).toBeInTheDocument()
    expect(screen.getByTestId('pagination-footer')).toBeInTheDocument()
  })

  it('calls onPolicyClick from the active policies section', async () => {
    const user = userEvent.setup()
    const onPolicyClick = vi.fn()
    const policy = makePolicy({ name: 'allowed-repos', violations: 2, mode: 'enforce' })

    render(
      <OPAPoliciesTable
        {...createDefaultProps({
          installedCount: 1,
          activePolicies: 1,
          totalViolations: 2,
          paginatedClusters: [makeCluster('alpha')],
          totalItems: 1,
          statuses: {
            alpha: makeStatus('alpha', { policies: [policy], violationCount: 2 }),
          },
          onPolicyClick,
        })}
      />,
    )

    expect(screen.getByText('Active Policies')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /allowed-repos/i }))
    expect(onPolicyClick).toHaveBeenCalledWith(policy)
  })
})
