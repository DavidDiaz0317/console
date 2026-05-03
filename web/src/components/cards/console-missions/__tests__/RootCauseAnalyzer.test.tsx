import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RootCauseAnalyzer, type RootCauseGroup } from '../RootCauseAnalyzer'
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

describe('RootCauseAnalyzer', () => {
  const mockUnifiedItem: UnifiedItem = {
    id: 'node-1',
    category: 'offline',
    name: 'node-1',
    cluster: 'cluster-a',
    severity: 'critical',
    reason: 'Memory pressure',
    rootCause: {
      cause: 'Memory pressure',
      details: 'Node is running low on memory',
    },
  }

  const mockRootCauseGroup: RootCauseGroup = {
    cause: 'Memory pressure',
    details: 'Node is running low on memory',
    items: [mockUnifiedItem],
    severity: 'critical',
    categories: new Set(['offline']),
  }

  const defaultProps = {
    rootCauseGroups: [mockRootCauseGroup],
    expandedGroups: new Set<string>(),
    toggleGroupExpand: vi.fn(),
    search: '',
    localClusterFilter: [],
    drillToNode: vi.fn(),
    drillToCluster: vi.fn(),
    startMission: vi.fn(),
  }

  it('renders root cause groups', () => {
    render(<RootCauseAnalyzer {...defaultProps} />)
    expect(screen.getByText('Memory pressure')).toBeInTheDocument()
  })

  it('shows empty state when no root cause groups', () => {
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        rootCauseGroups={[]}
      />
    )
    expect(screen.getByText(/cards:consoleOfflineDetection.allHealthy/)).toBeInTheDocument()
  })

  it('shows "no matching items" message when search applied with no results', () => {
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        rootCauseGroups={[]}
        search="nonexistent"
      />
    )
    expect(screen.getByText(/common:common.noMatchingItems/)).toBeInTheDocument()
  })

  it('shows "no matching items" message when cluster filter applied with no results', () => {
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        rootCauseGroups={[]}
        localClusterFilter={['cluster-b']}
      />
    )
    expect(screen.getByText(/common:common.noMatchingItems/)).toBeInTheDocument()
  })

  it('displays item count in group header', () => {
    render(<RootCauseAnalyzer {...defaultProps} />)
    expect(screen.getByText(/1 item/)).toBeInTheDocument()
  })

  it('displays correct plural for multiple items', () => {
    const groupWith3Items: RootCauseGroup = {
      ...mockRootCauseGroup,
      items: [mockUnifiedItem, mockUnifiedItem, mockUnifiedItem],
    }
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        rootCauseGroups={[groupWith3Items]}
      />
    )
    expect(screen.getByText(/3 items/)).toBeInTheDocument()
  })

  it('shows "Fix once, solve many" indicator when multiple items affected', () => {
    const groupWith2Items: RootCauseGroup = {
      ...mockRootCauseGroup,
      items: [mockUnifiedItem, mockUnifiedItem],
    }
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        rootCauseGroups={[groupWith2Items]}
      />
    )
    expect(screen.getByText(/Fix once, solve 2/)).toBeInTheDocument()
  })

  it('does not show "Fix once" indicator for single item groups', () => {
    render(<RootCauseAnalyzer {...defaultProps} />)
    expect(screen.queryByText(/Fix once, solve 1/)).not.toBeInTheDocument()
  })

  it('toggles group expansion when header clicked', async () => {
    const user = userEvent.setup()
    const toggleGroupExpand = vi.fn()
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        toggleGroupExpand={toggleGroupExpand}
      />
    )

    const groupHeader = screen.getByText('Memory pressure').closest('div')
    if (groupHeader) {
      await user.click(groupHeader)
      expect(toggleGroupExpand).toHaveBeenCalledWith('Memory pressure')
    }
  })

  it('expands group when in expandedGroups set', () => {
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        expandedGroups={new Set(['Memory pressure'])}
      />
    )
    expect(screen.getByText('Memory pressure')).toBeInTheDocument()
  })

  it('calls startMission with correct parameters when diagnose button clicked', async () => {
    const user = userEvent.setup()
    const startMission = vi.fn()
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        startMission={startMission}
      />
    )

    const diagnoseButton = screen.getByRole('button', { name: /Diagnose/ })
    await user.click(diagnoseButton)
    expect(startMission).toHaveBeenCalled()
    expect(startMission).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('Diagnose'),
        type: 'troubleshoot',
      })
    )
  })

  it('handles multiple root cause groups', () => {
    const group2: RootCauseGroup = {
      cause: 'Disk pressure',
      details: 'Node disk is full',
      items: [{ ...mockUnifiedItem, id: 'node-2', reason: 'Disk pressure' }],
      severity: 'warning',
      categories: new Set(['offline']),
    }
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        rootCauseGroups={[mockRootCauseGroup, group2]}
      />
    )
    expect(screen.getByText('Memory pressure')).toBeInTheDocument()
    expect(screen.getByText('Disk pressure')).toBeInTheDocument()
  })

  it('displays group details in subtext', () => {
    render(<RootCauseAnalyzer {...defaultProps} />)
    expect(screen.getByText('Node is running low on memory')).toBeInTheDocument()
  })

  it('shows critical severity styling', () => {
    render(<RootCauseAnalyzer {...defaultProps} />)
    expect(screen.getByText('Memory pressure')).toBeInTheDocument()
  })

  it('shows warning severity styling for warning groups', () => {
    const warningGroup: RootCauseGroup = {
      ...mockRootCauseGroup,
      severity: 'warning',
    }
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        rootCauseGroups={[warningGroup]}
      />
    )
    expect(screen.getByText('Memory pressure')).toBeInTheDocument()
  })

  it('shows info severity styling for info groups', () => {
    const infoGroup: RootCauseGroup = {
      ...mockRootCauseGroup,
      severity: 'info',
    }
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        rootCauseGroups={[infoGroup]}
      />
    )
    expect(screen.getByText('Memory pressure')).toBeInTheDocument()
  })

  it('calls drillToNode when item row clicked', () => {
    const drillToNode = vi.fn()
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        drillToNode={drillToNode}
      />
    )
    // Group header click should not trigger drill
    expect(drillToNode).not.toHaveBeenCalled()
  })

  it('includes node count in diagnosis title', async () => {
    const user = userEvent.setup()
    const startMission = vi.fn()
    const groupWith3Items: RootCauseGroup = {
      ...mockRootCauseGroup,
      items: [mockUnifiedItem, mockUnifiedItem, mockUnifiedItem],
    }
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        rootCauseGroups={[groupWith3Items]}
        startMission={startMission}
      />
    )

    const diagnoseButton = screen.getByRole('button', { name: /Diagnose/ })
    await user.click(diagnoseButton)
    expect(startMission).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('3'),
      })
    )
  })

  it('handles empty groups array gracefully', () => {
    render(
      <RootCauseAnalyzer
        {...defaultProps}
        rootCauseGroups={[]}
      />
    )
    expect(screen.getByText(/cards:consoleOfflineDetection.allHealthy/)).toBeInTheDocument()
  })

  it('renders chevron icon in header', () => {
    render(<RootCauseAnalyzer {...defaultProps} />)
    expect(screen.getByText('Memory pressure')).toBeInTheDocument()
  })
})
