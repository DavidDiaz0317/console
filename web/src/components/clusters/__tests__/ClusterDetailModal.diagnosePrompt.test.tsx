/**
 * Tests for diagnose/repair prompt builder — deployment replica counts
 * Ensures replica values are never "undefined" in AI prompts (fixes #15899)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ClusterHealth, ClusterInfo, DeploymentIssue } from '../../../hooks/mcp/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      if (key === 'cluster.andMoreClusters') return `+${options?.count || 0} more`
      return key
    },
  }),
}))

const clusterInfo: ClusterInfo = {
  name: 'test-cluster',
  server: 'https://test.example.com:6443',
  healthy: true,
  aliases: [],
  namespaces: [],
}

const health: ClusterHealth = {
  cluster: 'test-cluster',
  healthy: true,
  apiServer: 'https://test.example.com:6443',
  nodeCount: 2,
  readyNodes: 2,
  podCount: 8,
  cpuCores: 4,
  memoryGB: 8,
}

const mockStartMission = vi.fn()
let mockDeploymentIssues: DeploymentIssue[] = []

interface TestDeploymentIssueInput {
  name: string
  namespace: string
  replicas: number | null | undefined
  readyReplicas: number | null | undefined
  reason?: string
}

const NORMAL_DEPLOYMENT: TestDeploymentIssueInput = {
  name: 'nginx',
  namespace: 'default',
  replicas: 3,
  readyReplicas: 1,
}

const UNDEFINED_REPLICAS_DEPLOYMENT: TestDeploymentIssueInput = {
  name: 'api-server',
  namespace: 'production',
  replicas: undefined,
  readyReplicas: undefined,
}

const PARTIALLY_LOADED_DEPLOYMENT: TestDeploymentIssueInput = {
  name: 'worker',
  namespace: 'jobs',
  replicas: undefined,
  readyReplicas: 0,
}

const ZERO_REPLICAS_DEPLOYMENT: TestDeploymentIssueInput = {
  name: 'scaled-down',
  namespace: 'staging',
  replicas: 0,
  readyReplicas: 0,
}

const NULL_REPLICAS_DEPLOYMENT: TestDeploymentIssueInput = {
  name: 'cache',
  namespace: 'infra',
  replicas: null,
  readyReplicas: null,
}

const LARGE_REPLICA_DEPLOYMENT: TestDeploymentIssueInput = {
  name: 'web-frontend',
  namespace: 'production',
  replicas: 100,
  readyReplicas: 100,
}

const REPAIR_PROMPT_DEPLOYMENT: TestDeploymentIssueInput = {
  name: 'broken-deploy',
  namespace: 'default',
  replicas: undefined,
  readyReplicas: undefined,
  reason: 'ImagePullBackOff',
}

function createDeploymentIssue(issue: TestDeploymentIssueInput): DeploymentIssue {
  return {
    name: issue.name,
    namespace: issue.namespace,
    cluster: 'test-cluster',
    replicas: issue.replicas as unknown as number,
    readyReplicas: issue.readyReplicas as unknown as number,
    ...(issue.reason ? { reason: issue.reason } : {}),
  }
}

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({ deduplicatedClusters: [clusterInfo], clusters: [clusterInfo] }),
  useClusterHealth: () => ({ health, isLoading: false, error: null }),
  usePodIssues: () => ({ issues: [] }),
  useDeploymentIssues: () => ({ issues: mockDeploymentIssues }),
  useGPUNodes: () => ({ nodes: [], isLoading: false, isRefreshing: false }),
  useNodes: () => ({ nodes: [], isLoading: false }),
  useNamespaceStats: () => ({ stats: [], isLoading: false }),
  useDeployments: () => ({ deployments: [] }),
}))

vi.mock('../utils', () => ({
  isClusterUnreachable: () => false,
  isClusterHealthy: () => true,
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToPod: vi.fn(), drillToDeployment: vi.fn() }),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

vi.mock('../../../lib/analytics', () => ({
  emitClusterAction: vi.fn(),
}))

vi.mock('../../../lib/modals', () => ({
  BaseModal: ({ children, isOpen }: { children: ReactNode; isOpen?: boolean }) => isOpen ? <div data-testid="base-modal">{children}</div> : null,
}))

vi.mock('../../charts/Gauge', () => ({
  Gauge: () => <div data-testid="gauge" />,
}))

vi.mock('../NodeListItem', () => ({
  NodeListItem: () => null,
}))

vi.mock('../NodeDetailPanel', () => ({
  NodeDetailPanel: () => null,
}))

vi.mock('../components', () => ({
  NamespaceResources: () => null,
}))

vi.mock('../ResourceDetailModals', () => ({
  CPUDetailModal: () => null,
  MemoryDetailModal: () => null,
  StorageDetailModal: () => null,
  GPUDetailModal: () => null,
}))

vi.mock('../../ui/CloudProviderIcon', () => ({
  CloudProviderIcon: () => <div data-testid="cloud-provider-icon" />,
  detectCloudProvider: () => 'kubernetes',
  getProviderLabel: () => 'Kubernetes',
  getConsoleUrl: () => null,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../ui/Button', () => ({
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
}))

vi.mock('../ClusterStatusDetails', () => ({
  ClusterStatusDetails: () => <div data-testid="cluster-status-details" />,
}))

import { ClusterDetailModal } from '../ClusterDetailModal'

/**
 * Helper: triggers diagnose action and returns the prompt passed to startMission
 */
function getDiagnosePrompt(): string {
  render(<ClusterDetailModal clusterName="test-cluster" onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('clusterDetail.diagnose'))
  const call = mockStartMission.mock.calls[0]?.[0]
  return call?.initialPrompt ?? ''
}

/**
 * Helper: triggers repair action and returns the prompt passed to startMission
 */
function getRepairPrompt(): string {
  render(<ClusterDetailModal clusterName="test-cluster" onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('clusterDetail.repair'))
  const call = mockStartMission.mock.calls[0]?.[0]
  return call?.initialPrompt ?? ''
}

describe('Diagnose prompt — deployment replica counts', () => {
  beforeEach(() => {
    mockStartMission.mockClear()
    mockDeploymentIssues = []
  })

  it('renders normal replica counts correctly in diagnose prompt', () => {
    mockDeploymentIssues = [createDeploymentIssue(NORMAL_DEPLOYMENT)]

    const prompt = getDiagnosePrompt()
    expect(prompt).toContain('1/3 ready')
    expect(prompt).not.toContain('undefined')
  })

  it('renders normal replica counts correctly in repair prompt', () => {
    mockDeploymentIssues = [{
      name: 'nginx',
      namespace: 'default',
      cluster: 'test-cluster',
      replicas: 3,
      readyReplicas: 1,
      reason: 'CrashLoopBackOff',
    }]

    const prompt = getRepairPrompt()
    expect(prompt).toContain('1/3 ready')
    expect(prompt).not.toContain('undefined')
  })

  it('never shows "undefined/undefined" when replicas are undefined', () => {
    mockDeploymentIssues = [createDeploymentIssue(UNDEFINED_REPLICAS_DEPLOYMENT)]

    const prompt = getDiagnosePrompt()
    expect(prompt).not.toContain('undefined/undefined ready')
    expect(prompt).not.toContain('undefined')
    expect(prompt).toContain('0/0 ready')
  })

  it('never shows "undefined" when only readyReplicas is undefined', () => {
    mockDeploymentIssues = [{
      name: 'worker',
      namespace: 'jobs',
      cluster: 'test-cluster',
      replicas: 5,
      readyReplicas: undefined as unknown as number,
    }]

    const prompt = getDiagnosePrompt()
    expect(prompt).not.toContain('undefined')
    expect(prompt).toContain('0/5 ready')
  })

  it('never shows "undefined" for partially loaded replica counts', () => {
    mockDeploymentIssues = [createDeploymentIssue(PARTIALLY_LOADED_DEPLOYMENT)]

    const prompt = getDiagnosePrompt()
    expect(prompt).not.toContain('undefined')
    expect(prompt).toContain('0/0 ready')
  })

  it('never shows "null/null" when replicas are null', () => {
    mockDeploymentIssues = [createDeploymentIssue(NULL_REPLICAS_DEPLOYMENT)]

    const prompt = getDiagnosePrompt()
    expect(prompt).not.toContain('null/null ready')
    expect(prompt).not.toContain('null')
    expect(prompt).toContain('0/0 ready')
  })

  it('handles zero replicas correctly (healthy zero state)', () => {
    mockDeploymentIssues = [createDeploymentIssue(ZERO_REPLICAS_DEPLOYMENT)]

    const prompt = getDiagnosePrompt()
    expect(prompt).toContain('0/0 ready')
    expect(prompt).not.toContain('undefined')
  })

  it('handles large replica counts', () => {
    mockDeploymentIssues = [createDeploymentIssue(LARGE_REPLICA_DEPLOYMENT)]

    const prompt = getDiagnosePrompt()
    expect(prompt).toContain('100/100 ready')
  })

  it('handles empty deployment issues array without crashing', () => {
    mockDeploymentIssues = []

    const prompt = getDiagnosePrompt()
    expect(prompt).toContain('No known issues')
    expect(prompt).not.toContain('undefined')
  })

  it('repair prompt guards against undefined replicas', () => {
    mockDeploymentIssues = [createDeploymentIssue(REPAIR_PROMPT_DEPLOYMENT)]

    const prompt = getRepairPrompt()
    expect(prompt).not.toContain('undefined/undefined')
    expect(prompt).toContain('0/0 ready')
    expect(prompt).toContain('ImagePullBackOff')
  })
})
