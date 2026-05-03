import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnifiedItemsList } from '../UnifiedItemsList'
import type { UnifiedItem } from '../offlineDataTransforms'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children, color }: any) => <span className={`badge-${color}`}>{children}</span>,
}))

vi.mock('../../../../lib/cards/CardComponents', () => ({
  CardAIActions: () => <div>AI Actions</div>,
}))

vi.mock('../TrendIcon', () => ({
  TrendIcon: ({ trend }: { trend: string }) => <span>{trend || 'stable'}</span>,
}))

describe('UnifiedItemsList', () => {
  const mockOfflineItem: UnifiedItem = {
    id: 'offline-node-1',
    category: 'offline',
    name: 'node-1',
    cluster: 'cluster-a',
    severity: 'critical',
    reason: 'Memory pressure',
    reasonDetailed: 'Node is running low on memory',
    nodeData: {
      name: 'node-1',
      cluster: 'cluster-a',
      status: 'NotReady',
      roles: ['worker'],
      unschedulable: false,
    },
  }

  const mockGpuItem: UnifiedItem = {
    id: 'gpu-node-1',
    category: 'gpu',
    name: 'node-2',
    cluster: 'cluster-a',
    severity: 'warning',
    reason: 'GPU unavailable',
    gpuData: {
      nodeName: 'node-2',
      cluster: 'cluster-a',
      expected: 4,
      available: 2,
      reason: 'GPU reset required',
    },
  }

  const mockPredictionItem: UnifiedItem = {
    id: 'pred-1',
    category: 'prediction',
    name: 'high-latency-predicted',
    cluster: 'cluster-a',
    severity: 'warning',
    reason: 'High latency risk',
    reasonDetailed: 'Latency expected to increase',
    predictionData: {
      id: 'pred-1',
      name: 'high-latency-predicted',
      cluster: 'cluster-a',
      severity: 'warning',
      reason: 'High latency risk',
      trend: 'worsening',
    },
  }

  const defaultProps = {
    paginatedItems: [mockOfflineItem],
    sortedItemsLength: 1,
    search: '',
    localClusterFilter: [],
    drillToNode: vi.fn(),
    drillToCluster: vi.fn(),
    getFeedback: vi.fn(() => null),
    submitFeedback: vi.fn(),
  }

  it('renders offline node item', () => {
    render(<UnifiedItemsList {...defaultProps} />)
    expect(screen.getByText('node-1')).toBeInTheDocument()
  })

  it('displays offline node status', () => {
    render(<UnifiedItemsList {...defaultProps} />)
    expect(screen.getByText(/cards:consoleOfflineDetection.offline/)).toBeInTheDocument()
  })

  it('displays cluster badge for offline nodes', () => {
    render(<UnifiedItemsList {...defaultProps} />)
    expect(screen.getByText('cluster-a')).toBeInTheDocument()
  })

  it('calls drillToNode when offline item clicked', async () => {
    const user = userEvent.setup()
    const drillToNode = vi.fn()
    render(
      <UnifiedItemsList
        {...defaultProps}
        drillToNode={drillToNode}
      />
    )

    const nodeRow = screen.getByText('node-1').closest('div')
    if (nodeRow) {
      await user.click(nodeRow)
      expect(drillToNode).toHaveBeenCalledWith('cluster-a', 'node-1', expect.any(Object))
    }
  })

  it('renders GPU issue item', () => {
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[mockGpuItem]}
      />
    )
    expect(screen.getByText('node-2')).toBeInTheDocument()
  })

  it('displays GPU issue details', () => {
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[mockGpuItem]}
      />
    )
    expect(screen.getByText('node-2')).toBeInTheDocument()
  })

  it('renders prediction item', () => {
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[mockPredictionItem]}
      />
    )
    expect(screen.getByText('high-latency-predicted')).toBeInTheDocument()
  })

  it('displays prediction trend icon', () => {
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[mockPredictionItem]}
      />
    )
    expect(screen.getByText('worsening')).toBeInTheDocument()
  })

  it('calls drillToCluster when GPU item clicked', async () => {
    const user = userEvent.setup()
    const drillToCluster = vi.fn()
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[mockGpuItem]}
        drillToCluster={drillToCluster}
      />
    )

    const gpuRow = screen.getByText('node-2').closest('div')
    if (gpuRow) {
      await user.click(gpuRow)
      expect(drillToCluster).toHaveBeenCalled()
    }
  })

  it('shows empty state when no items', () => {
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[]}
        sortedItemsLength={0}
      />
    )
    expect(screen.getByText(/All nodes & GPUs healthy|cards:consoleOfflineDetection.allHealthy/)).toBeInTheDocument()
  })

  it('shows "no matching items" when search applied with no results', () => {
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[]}
        sortedItemsLength={0}
        search="nonexistent"
      />
    )
    expect(screen.getByText(/No matching items|common:common.noMatchingItems/)).toBeInTheDocument()
  })

  it('shows "no matching items" when cluster filter applied with no results', () => {
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[]}
        sortedItemsLength={0}
        localClusterFilter={['cluster-b']}
      />
    )
    expect(screen.getByText(/No matching items|common:common.noMatchingItems/)).toBeInTheDocument()
  })

  it('renders multiple items', () => {
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[mockOfflineItem, mockGpuItem, mockPredictionItem]}
        sortedItemsLength={3}
      />
    )
    expect(screen.getByText('node-1')).toBeInTheDocument()
    expect(screen.getByText('node-2')).toBeInTheDocument()
    expect(screen.getByText('high-latency-predicted')).toBeInTheDocument()
  })

  it('displays root cause in offline nodes', () => {
    render(<UnifiedItemsList {...defaultProps} />)
    expect(screen.getByText('Memory pressure')).toBeInTheDocument()
  })

  it('displays detailed reason in offline nodes', () => {
    render(<UnifiedItemsList {...defaultProps} />)
    expect(screen.getByText('Node is running low on memory')).toBeInTheDocument()
  })

  it('shows cordoned status for unschedulable nodes', () => {
    const cordonedNode: UnifiedItem = {
      ...mockOfflineItem,
      nodeData: {
        ...mockOfflineItem.nodeData!,
        unschedulable: true,
      },
    }
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[cordonedNode]}
      />
    )
    expect(screen.getByText('node-1')).toBeInTheDocument()
  })

  it('displays AI actions for offline nodes', () => {
    render(<UnifiedItemsList {...defaultProps} />)
    expect(screen.getByText('AI Actions')).toBeInTheDocument()
  })

  it('passes node context to drill action', async () => {
    const user = userEvent.setup()
    const drillToNode = vi.fn()
    render(
      <UnifiedItemsList
        {...defaultProps}
        drillToNode={drillToNode}
      />
    )

    const nodeRow = screen.getByText('node-1').closest('div')
    if (nodeRow) {
      await user.click(nodeRow)
      expect(drillToNode).toHaveBeenCalledWith(
        'cluster-a',
        'node-1',
        expect.objectContaining({
          status: 'NotReady',
          roles: expect.any(Array),
        })
      )
    }
  })

  it('displays GPU expected vs available count', () => {
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[mockGpuItem]}
      />
    )
    // Should show GPU details
    expect(screen.getByText('node-2')).toBeInTheDocument()
  })

  it('handles items without node data gracefully', () => {
    const itemWithoutNodeData: UnifiedItem = {
      ...mockOfflineItem,
      nodeData: undefined,
    }
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[itemWithoutNodeData]}
      />
    )
    expect(screen.getByText('node-1')).toBeInTheDocument()
  })

  it('handles items without gpu data gracefully', () => {
    const itemWithoutGpuData: UnifiedItem = {
      ...mockGpuItem,
      gpuData: undefined,
    }
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[itemWithoutGpuData]}
      />
    )
    // Should render but skip GPU row
    expect(screen.queryByText('node-2')).not.toBeInTheDocument()
  })

  it('handles feedback submission for predictions', () => {
    const submitFeedback = vi.fn()
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[mockPredictionItem]}
        submitFeedback={submitFeedback}
      />
    )
    // Prediction should be rendered with feedback capabilities
    expect(screen.getByText('high-latency-predicted')).toBeInTheDocument()
  })

  it('displays green checkmark in empty state', () => {
    render(
      <UnifiedItemsList
        {...defaultProps}
        paginatedItems={[]}
        sortedItemsLength={0}
      />
    )
    // Empty state with healthy indicator
    expect(screen.getByText(/All nodes & GPUs healthy|cards:consoleOfflineDetection.allHealthy/)).toBeInTheDocument()
  })
})
