import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OPAPoliciesTable } from './OPAPoliciesTable'
import type { GatekeeperStatus, OPAClusterItem, Policy } from './opa'
import type { SortByOption } from './OPAPolicies.types'
import type { ClusterWithHealth } from '../../lib/cards/cardFilters'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${opts.count}`
      const parts = key.split('.')
      return parts[parts.length - 1]
    },
  }),
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: ({ isRefreshing }: { isRefreshing: boolean }) => (
    <div data-testid="refresh-indicator" data-refreshing={isRefreshing} />
  ),
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="search-input" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: ({ extra }: { extra: React.ReactNode }) => (
    <div data-testid="card-controls">{extra}</div>
  ),
  CardPaginationFooter: ({
    currentPage,
    totalPages,
    onPageChange,
    needsPagination,
  }: {
    currentPage: number
    totalPages: number
    onPageChange: (p: number) => void
    needsPagination: boolean
  }) =>
    needsPagination ? (
      <div data-testid="pagination" data-page={currentPage} data-total={totalPages}>
        <button onClick={() => onPageChange(currentPage + 1)}>Next</button>
      </div>
    ) : null,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCluster(overrides: Partial<OPAClusterItem> = {}): OPAClusterItem {
  const name = overrides.name ?? `cluster-${Math.random().toString(36).slice(2)}`
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

function makeStatus(overrides: Partial<GatekeeperStatus> = {}): GatekeeperStatus {
  return {
    cluster: 'test-cluster',
    installed: true,
    policyCount: 0,
    violationCount: 0,
    loading: false,
    ...overrides,
  }
}

interface DefaultPropsConfig {
  installedCount?: number
  activePolicies?: number
  totalViolations?: number
  isRefreshing?: boolean
  lastRefresh?: number | null
  paginatedClusters?: OPAClusterItem[]
  totalItems?: number
  currentPage?: number
  totalPages?: number
  itemsPerPage?: number | 'unlimited'
  needsPagination?: boolean
  statuses?: Record<string, GatekeeperStatus>
  search?: string
  availableClusters?: ClusterWithHealth[]
  localClusterFilter?: string[]
  showClusterFilter?: boolean
  sortBy?: SortByOption
  sortDirection?: 'asc' | 'desc'
}

function makeDefaultProps(config: DefaultPropsConfig = {}) {
  const containerRef = { current: null }
  const clusterFilterRef = { current: null }
  const onShowViolations = vi.fn()
  const onInstallOPA = vi.fn()
  const onPolicyClick = vi.fn()
  const onCreatePolicy = vi.fn()
  const setSearch = vi.fn()
  const toggleClusterFilter = vi.fn()
  const clearClusterFilter = vi.fn()
  const setShowClusterFilter = vi.fn()
  const setSortBy = vi.fn()
  const setSortDirection = vi.fn()
  const goToPage = vi.fn()
  const setItemsPerPage = vi.fn()

  return {
    installedCount: config.installedCount ?? 0,
    activePolicies: config.activePolicies ?? 0,
    totalViolations: config.totalViolations ?? 0,
    isRefreshing: config.isRefreshing ?? false,
    lastRefresh: config.lastRefresh ?? null,
    containerRef,
    containerStyle: undefined,
    paginatedClusters: config.paginatedClusters ?? [],
    totalItems: config.totalItems ?? 0,
    currentPage: config.currentPage ?? 1,
    totalPages: config.totalPages ?? 1,
    itemsPerPage: config.itemsPerPage ?? 10,
    goToPage,
    needsPagination: config.needsPagination ?? false,
    setItemsPerPage,
    statuses: config.statuses ?? {},
    search: config.search ?? '',
    setSearch,
    availableClusters: config.availableClusters ?? [],
    localClusterFilter: config.localClusterFilter ?? [],
    toggleClusterFilter,
    clearClusterFilter,
    showClusterFilter: config.showClusterFilter ?? false,
    setShowClusterFilter,
    clusterFilterRef,
    sorting: {
      sortBy: config.sortBy ?? 'name',
      setSortBy,
      sortDirection: config.sortDirection ?? 'asc',
      setSortDirection,
    },
    onShowViolations,
    onInstallOPA,
    onPolicyClick,
    onCreatePolicy,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OPAPoliciesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- Empty state ----

  describe('empty state', () => {
    it('renders "No clusters available" when no clusters are provided', () => {
      const props = makeDefaultProps({ paginatedClusters: [] })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('No clusters available')).toBeInTheDocument()
    })

    it('does not render empty state when clusters exist', () => {
      const cluster = makeCluster({ name: 'prod' })
      const props = makeDefaultProps({ paginatedClusters: [cluster] })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.queryByText('No clusters available')).not.toBeInTheDocument()
    })
  })

  // ---- Cluster list rendering ----

  describe('cluster list rendering', () => {
    it('renders all clusters in the paginatedClusters list', () => {
      const clusters = [makeCluster({ name: 'prod' }), makeCluster({ name: 'staging' })]
      const props = makeDefaultProps({ paginatedClusters: clusters })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('prod')).toBeInTheDocument()
      expect(screen.getByText('staging')).toBeInTheDocument()
    })

    it('renders cluster names as buttons for installed clusters', () => {
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({ cluster: 'prod', installed: true })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      const button = screen.getByRole('button', { name: /prod/i })
      expect(button).toBeInTheDocument()
    })
  })

  // ---- Offline cluster state ----

  describe('offline cluster display', () => {
    it('shows offline indicator for unreachable clusters', () => {
      const cluster = makeCluster({ name: 'prod', reachable: false })
      const props = makeDefaultProps({ paginatedClusters: [cluster] })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('offline')).toBeInTheDocument()
    })

    it('disables click interaction for offline clusters', () => {
      const cluster = makeCluster({ name: 'prod', reachable: false })
      const props = makeDefaultProps({ paginatedClusters: [cluster] })
      render(<OPAPoliciesTable {...props} />)
      const button = screen.getByRole('button', { name: /prod/i })
      expect(button).toBeDisabled()
    })

    it('does not show offline indicator for reachable clusters', () => {
      const cluster = makeCluster({ name: 'prod', reachable: true })
      const status = makeStatus({ cluster: 'prod', installed: true })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.queryByText('offline')).not.toBeInTheDocument()
    })
  })

  // ---- OPA installed vs not installed states ----

  describe('OPA installation state', () => {
    it('shows "Not installed" for clusters without OPA', () => {
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({ cluster: 'prod', installed: false })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('Not installed')).toBeInTheDocument()
    })

    it('shows policy count for clusters with OPA installed', () => {
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({ cluster: 'prod', installed: true, policyCount: 5 })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText(/5 policies/i)).toBeInTheDocument()
    })

    it('shows "Install with an AI Mission" link for uninstalled clusters', () => {
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({ cluster: 'prod', installed: false })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText(/Install with an AI Mission/i)).toBeInTheDocument()
    })

    it('calls onInstallOPA when install link is clicked', async () => {
      const user = userEvent.setup()
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({ cluster: 'prod', installed: false })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      await user.click(screen.getByText(/Install with an AI Mission/i))
      expect(props.onInstallOPA).toHaveBeenCalledWith('prod')
    })
  })

  // ---- Loading states ----

  describe('loading states', () => {
    it('shows loading spinner when no status is available (initial load)', () => {
      const cluster = makeCluster({ name: 'prod' })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: {},
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('checking')).toBeInTheDocument()
    })

    it('shows "Loading policies..." when installed but loading details', () => {
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({ cluster: 'prod', installed: true, loading: true })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('Loading policies...')).toBeInTheDocument()
    })

    it('does not show loading when data is loaded', () => {
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({
        cluster: 'prod',
        installed: true,
        loading: false,
        policyCount: 3,
      })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.queryByText('checking')).not.toBeInTheDocument()
      expect(screen.queryByText('Loading policies...')).not.toBeInTheDocument()
    })
  })

  // ---- Violations display ----

  describe('violations display', () => {
    it('shows violation count when violations > 0', () => {
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({
        cluster: 'prod',
        installed: true,
        violationCount: 12,
        policyCount: 5,
      })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText(/12 violations/i)).toBeInTheDocument()
    })

    it('does not show violations badge when violationCount is 0', () => {
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({
        cluster: 'prod',
        installed: true,
        violationCount: 0,
        policyCount: 3,
      })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.queryByText(/violations/i)).not.toBeInTheDocument()
    })

    it('calls onShowViolations when installed cluster is clicked', async () => {
      const user = userEvent.setup()
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({ cluster: 'prod', installed: true })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      await user.click(screen.getByRole('button', { name: /prod/i }))
      expect(props.onShowViolations).toHaveBeenCalledWith('prod')
    })
  })

  // ---- Summary stats ----

  describe('summary statistics', () => {
    it('shows summary stats when installedCount > 0', () => {
      const props = makeDefaultProps({
        installedCount: 3,
        activePolicies: 10,
        totalViolations: 5,
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('Policies Active')).toBeInTheDocument()
      expect(screen.getByText('10')).toBeInTheDocument()
      expect(screen.getByText('Violations')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('hides summary stats when installedCount is 0', () => {
      const props = makeDefaultProps({
        installedCount: 0,
        activePolicies: 0,
        totalViolations: 0,
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.queryByText('Policies Active')).not.toBeInTheDocument()
      expect(screen.queryByText('Violations')).not.toBeInTheDocument()
    })
  })

  // ---- Installed cluster badge ----

  describe('installed cluster badge', () => {
    it('shows installed cluster count badge when installedCount > 0', () => {
      const props = makeDefaultProps({ installedCount: 4 })
      render(<OPAPoliciesTable {...props} />)
      const badges = screen.getAllByTestId('status-badge')
      const clusterBadge = badges.find((b) => b.textContent === '4 clusters')
      expect(clusterBadge).toBeDefined()
    })

    it('shows singular "cluster" for installedCount = 1', () => {
      const props = makeDefaultProps({ installedCount: 1 })
      render(<OPAPoliciesTable {...props} />)
      const badges = screen.getAllByTestId('status-badge')
      const clusterBadge = badges.find((b) => b.textContent === '1 cluster')
      expect(clusterBadge).toBeDefined()
    })

    it('does not show cluster badge when installedCount is 0', () => {
      const props = makeDefaultProps({ installedCount: 0 })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.queryByTestId('status-badge')).not.toBeInTheDocument()
    })
  })

  // ---- Search interaction ----

  describe('search input', () => {
    it('renders search input with current search value', () => {
      const props = makeDefaultProps({ search: 'prod' })
      render(<OPAPoliciesTable {...props} />)
      const input = screen.getByTestId('search-input') as HTMLInputElement
      expect(input.value).toBe('prod')
    })

    it('calls setSearch when search input changes', async () => {
      const user = userEvent.setup()
      const props = makeDefaultProps()
      render(<OPAPoliciesTable {...props} />)
      const input = screen.getByTestId('search-input')
      await user.type(input, 'test')
      expect(props.setSearch).toHaveBeenCalled()
    })
  })

  // ---- Create policy button ----

  describe('create policy button', () => {
    it('renders create policy button in controls', () => {
      const props = makeDefaultProps()
      render(<OPAPoliciesTable {...props} />)
      const button = screen.getByTitle('createOPAPolicy')
      expect(button).toBeInTheDocument()
    })

    it('calls onCreatePolicy when create button is clicked', async () => {
      const user = userEvent.setup()
      const props = makeDefaultProps()
      render(<OPAPoliciesTable {...props} />)
      await user.click(screen.getByTitle('createOPAPolicy'))
      expect(props.onCreatePolicy).toHaveBeenCalled()
    })

    it('renders create policy button in footer', () => {
      const props = makeDefaultProps()
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByRole('button', { name: 'Create Policy' })).toBeInTheDocument()
    })

    it('calls onCreatePolicy when footer create button is clicked', async () => {
      const user = userEvent.setup()
      const props = makeDefaultProps()
      render(<OPAPoliciesTable {...props} />)
      await user.click(screen.getByRole('button', { name: 'Create Policy' }))
      expect(props.onCreatePolicy).toHaveBeenCalled()
    })
  })

  // ---- Policy mode badges ----

  describe('policy mode badges', () => {
    it('shows enforce mode badge for enforce policies', () => {
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({
        cluster: 'prod',
        installed: true,
        mode: 'enforce',
        policyCount: 1,
      })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('enforce')).toBeInTheDocument()
    })

    it('shows warn mode badge for warn policies', () => {
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({
        cluster: 'prod',
        installed: true,
        mode: 'warn',
        policyCount: 1,
      })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('warn')).toBeInTheDocument()
    })

    it('shows multiple mode badges when modes array is provided', () => {
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({
        cluster: 'prod',
        installed: true,
        modes: ['enforce', 'warn', 'dryrun'],
        policyCount: 3,
      })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('enforce')).toBeInTheDocument()
      expect(screen.getByText('warn')).toBeInTheDocument()
      expect(screen.getByText('dryrun')).toBeInTheDocument()
    })
  })

  // ---- Active policies preview ----

  describe('active policies preview', () => {
    it('shows active policies section when installedCount > 0 and policies exist', () => {
      const cluster = makeCluster({ name: 'prod' })
      const policy1 = makePolicy({ name: 'require-labels', violations: 0 })
      const policy2 = makePolicy({ name: 'block-privileged', violations: 3 })
      const status = makeStatus({
        cluster: 'prod',
        installed: true,
        policies: [policy1, policy2],
      })
      const props = makeDefaultProps({
        installedCount: 1,
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('Active Policies')).toBeInTheDocument()
      expect(screen.getByText('require-labels')).toBeInTheDocument()
      expect(screen.getByText('block-privileged')).toBeInTheDocument()
    })

    it('does not show active policies section when installedCount is 0', () => {
      const props = makeDefaultProps({ installedCount: 0 })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.queryByText('Active Policies')).not.toBeInTheDocument()
    })

    it('shows only first 4 policies in preview', () => {
      const cluster = makeCluster({ name: 'prod' })
      const policies = Array.from({ length: 10 }, (_, i) =>
        makePolicy({ name: `policy-${i}` }),
      )
      const status = makeStatus({
        cluster: 'prod',
        installed: true,
        policies,
      })
      const props = makeDefaultProps({
        installedCount: 1,
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('policy-0')).toBeInTheDocument()
      expect(screen.getByText('policy-3')).toBeInTheDocument()
      expect(screen.queryByText('policy-4')).not.toBeInTheDocument()
    })

    it('calls onPolicyClick when policy is clicked', async () => {
      const user = userEvent.setup()
      const cluster = makeCluster({ name: 'prod' })
      const policy = makePolicy({ name: 'require-labels' })
      const status = makeStatus({
        cluster: 'prod',
        installed: true,
        policies: [policy],
      })
      const props = makeDefaultProps({
        installedCount: 1,
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      await user.click(screen.getByRole('button', { name: /require-labels/i }))
      expect(props.onPolicyClick).toHaveBeenCalledWith(policy)
    })

    it('shows violation count for policies with violations > 0', () => {
      const cluster = makeCluster({ name: 'prod' })
      const policy = makePolicy({ name: 'require-labels', violations: 42 })
      const status = makeStatus({
        cluster: 'prod',
        installed: true,
        policies: [policy],
      })
      const props = makeDefaultProps({
        installedCount: 1,
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('42')).toBeInTheDocument()
    })
  })

  // ---- Pagination ----

  describe('pagination', () => {
    it('renders pagination when needsPagination is true', () => {
      const props = makeDefaultProps({
        needsPagination: true,
        totalPages: 3,
        currentPage: 1,
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByTestId('pagination')).toBeInTheDocument()
    })

    it('does not render pagination when needsPagination is false', () => {
      const props = makeDefaultProps({ needsPagination: false })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
    })
  })

  // ---- Refresh state ----

  describe('refresh indicator', () => {
    it('shows isRefreshing=true when refreshing', () => {
      const props = makeDefaultProps({ isRefreshing: true })
      render(<OPAPoliciesTable {...props} />)
      const indicator = screen.getByTestId('refresh-indicator')
      expect(indicator).toHaveAttribute('data-refreshing', 'true')
    })

    it('shows isRefreshing=false when not refreshing', () => {
      const props = makeDefaultProps({ isRefreshing: false })
      render(<OPAPoliciesTable {...props} />)
      const indicator = screen.getByTestId('refresh-indicator')
      expect(indicator).toHaveAttribute('data-refreshing', 'false')
    })
  })

  // ---- Error states ----

  describe('error states', () => {
    it('shows error message when status has error', () => {
      const cluster = makeCluster({ name: 'prod' })
      const status = makeStatus({
        cluster: 'prod',
        installed: false,
        error: 'Connection timeout',
      })
      const props = makeDefaultProps({
        paginatedClusters: [cluster],
        statuses: { prod: status },
      })
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByText('Connection timeout')).toBeInTheDocument()
    })
  })

  // ---- Footer links ----

  describe('footer links', () => {
    it('renders all footer documentation links', () => {
      const props = makeDefaultProps()
      render(<OPAPoliciesTable {...props} />)
      expect(screen.getByRole('link', { name: 'Install Guide' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Policy Library' })).toBeInTheDocument()
    })

    it('footer links have correct href attributes', () => {
      const props = makeDefaultProps()
      render(<OPAPoliciesTable {...props} />)
      const installLink = screen.getByRole('link', { name: 'Install Guide' })
      expect(installLink).toHaveAttribute(
        'href',
        'https://open-policy-agent.github.io/gatekeeper/website/docs/install',
      )
      const libraryLink = screen.getByRole('link', { name: 'Policy Library' })
      expect(libraryLink).toHaveAttribute(
        'href',
        'https://open-policy-agent.github.io/gatekeeper-library/website/',
      )
    })
  })
})
