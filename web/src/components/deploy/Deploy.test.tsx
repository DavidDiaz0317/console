import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockDashboardPageProps, mockCachedDeployments, mockDeploymentsHook } = vi.hoisted(() => ({
  mockDashboardPageProps: { current: null as Record<string, unknown> | null },
  mockCachedDeployments: vi.fn(),
  mockDeploymentsHook: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => {
      if (key === 'common:deploy.title') return 'Deploy'
      if (key === 'common:deploy.subtitle') return 'Monitor deployments, GitOps, and Helm releases across clusters'
      if (key === 'common:deploy.totalDeployments') return 'total deployments'
      if (key === 'common:deploy.deploying') return 'deploying'
      if (key === 'common:deploy.applications') return 'applications'
      if (key === 'common:common.running') return 'running'
      if (key === 'common:common.failed') return 'failed'
      if (key === 'cards:deploymentIssues.allHealthy') return 'All deployments healthy'
      if (key === 'common:deploy.criticalIssueCount') return `${opts?.count ?? 0} critical issues`
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: (props: Record<string, unknown>) => {
    mockDashboardPageProps.current = props
    return (
      <div data-testid="dashboard-page">
        <div data-testid="after-title">{props.afterTitle as ReactNode}</div>
      </div>
    )
  },
}))

vi.mock('../../hooks/useMCP', () => ({
  useDeployments: () => mockDeploymentsHook(),
  useClusters: () => ({ deduplicatedClusters: [] }),
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedDeployments: () => mockCachedDeployments(),
}))

vi.mock('../../hooks/useArgoCD', () => ({
  useArgoCDApplications: () => ({ applications: [], isDemoData: false }),
}))

vi.mock('../../hooks/useClusterGroups', () => ({
  useClusterGroups: () => ({ groups: [] }),
}))

vi.mock('../../lib/cardEvents', () => ({
  useCardPublish: () => vi.fn(),
}))

vi.mock('./DeployConfirmDialog', () => ({
  DeployConfirmDialog: () => null,
}))

vi.mock('../../hooks/useWorkloads', () => ({
  useDeployWorkload: () => ({ mutate: vi.fn() }),
}))

vi.mock('../../hooks/usePersistence', () => ({
  usePersistence: () => ({ isEnabled: false, isActive: false }),
}))

vi.mock('../../hooks/useConsoleCRs', () => ({
  useWorkloadDeployments: () => ({ createItem: vi.fn() }),
  useManagedWorkloads: () => ({ createItem: vi.fn() }),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../lib/modals/useModalNavigation', () => ({
  useModalNavigation: vi.fn(),
  useModalFocusTrap: vi.fn(),
}))

vi.mock('../../config/dashboards', () => ({
  deployDashboardConfig: { storageKey: 'deploy-test-key' },
  getDefaultCards: () => [],
}))

vi.mock('../ui/RotatingTip', () => ({
  RotatingTip: () => null,
}))

import { Deploy } from './Deploy'

describe('Deploy', () => {
  beforeEach(() => {
    mockDashboardPageProps.current = null
    mockDeploymentsHook.mockReturnValue({
      isLoading: false,
      isRefreshing: false,
      lastUpdated: null,
      refetch: vi.fn(),
    })
    mockCachedDeployments.mockReturnValue({ deployments: [] })
  })

  it('uses deployment data for the header badge and stat counts', () => {
    mockCachedDeployments.mockReturnValue({
      deployments: [
        {
          name: 'api',
          namespace: 'default',
          cluster: 'prod',
          status: 'running',
          replicas: 1,
          readyReplicas: 1,
          updatedReplicas: 1,
          availableReplicas: 1,
          progress: 100,
        },
      ],
    })

    render(<Deploy />)

    expect(screen.getByText('All deployments healthy')).toBeTruthy()

    const props = mockDashboardPageProps.current
    expect(props).toBeTruthy()
    const getStatValue = props?.getStatValue as ((blockId: string) => { value: number }) | undefined
    expect(getStatValue?.('healthy').value).toBe(1)
    expect(getStatValue?.('failed').value).toBe(0)
  })

  it('hides the header badge while deployments are still loading with no data', () => {
    mockDeploymentsHook.mockReturnValue({
      isLoading: true,
      isRefreshing: false,
      lastUpdated: null,
      refetch: vi.fn(),
    })

    render(<Deploy />)

    expect(screen.getByTestId('after-title').textContent).toBe('')
  })
})
