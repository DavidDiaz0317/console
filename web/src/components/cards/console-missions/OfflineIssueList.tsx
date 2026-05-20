import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layers, List } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ALERT_SEVERITY_ORDER } from '../../../types/alerts'
import { cn } from '../../../lib/cn'
import { CardControlsRow, CardPaginationFooter, CardSearchInput } from '../../../lib/cards/CardComponents'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import type { StartMissionParams } from '../../../hooks/useMissionTypes'
import type { PredictedRisk } from '../../../types/predictions'
import {
  type ClusterHealthIssue,
  type GpuIssue,
  type NodeData,
  type SortField,
  type UnifiedItem,
  SORT_OPTIONS,
  buildClusterHealthItems,
  buildGpuItems,
  buildOfflineItems,
  buildPredictionItems,
} from './offlineDataTransforms'
import { UnifiedItemsList } from './UnifiedItemsList'
import { RootCauseAnalyzer, type RootCauseGroup } from './RootCauseAnalyzer'
import { AIAnalysisPanel } from './AIAnalysisPanel'

type OfflineIssueListProps = {
  offlineNodes: NodeData[]
  clusterHealthIssues: ClusterHealthIssue[]
  gpuIssues: GpuIssue[]
  predictedRisks: PredictedRisk[]
  drillToNode: (cluster: string, name: string, extras: Record<string, unknown>) => void
  drillToCluster: (cluster: string) => void
  startMission: (params: StartMissionParams) => string
  checkKeyAndRun: (onSuccess: () => void | Promise<void>) => void
  runningMission: boolean
  getFeedback: (id: string) => string | null
  submitFeedback: (id: string, feedback: string, type: string, provider?: string) => void
}

export function OfflineIssueList({
  offlineNodes,
  clusterHealthIssues,
  gpuIssues,
  predictedRisks,
  drillToNode,
  drillToCluster,
  startMission,
  checkKeyAndRun,
  runningMission,
  getFeedback,
  submitFeedback,
}: OfflineIssueListProps) {
  const { t } = useTranslation(['cards', 'common'])
  const [search, setSearch] = useState('')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [sortField, setSortField] = useState<SortField>('severity')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState<number | 'unlimited'>(5)
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  const unifiedItems = useMemo((): UnifiedItem[] => {
    return [
      ...buildOfflineItems(offlineNodes),
      ...buildClusterHealthItems(clusterHealthIssues),
      ...buildGpuItems(gpuIssues),
      ...buildPredictionItems(predictedRisks),
    ]
  }, [clusterHealthIssues, gpuIssues, offlineNodes, predictedRisks])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(target)) {
        setShowClusterFilter(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const availableClustersForFilter = useMemo(() => {
    const clusterSet = new Set<string>()
    unifiedItems.forEach(item => clusterSet.add(item.cluster))
    return Array.from(clusterSet).sort()
  }, [unifiedItems])

  const filteredItems = useMemo(() => {
    let result = unifiedItems

    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.cluster.toLowerCase().includes(query) ||
        item.reason.toLowerCase().includes(query),
      )
    }

    if (localClusterFilter.length > 0) {
      result = result.filter(item => localClusterFilter.includes(item.cluster))
    }

    return result
  }, [localClusterFilter, search, unifiedItems])

  const sortedItems = useMemo(() => {
    const severityOrder = ALERT_SEVERITY_ORDER as Record<string, number>
    const categoryOrder: Record<string, number> = { offline: 0, gpu: 1, prediction: 2 }

    return [...filteredItems].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'cluster':
          comparison = a.cluster.localeCompare(b.cluster)
          break
        case 'severity':
          comparison = (severityOrder[a.severity] ?? 999) - (severityOrder[b.severity] ?? 999)
          break
        case 'category':
          comparison = (categoryOrder[a.category] ?? 999) - (categoryOrder[b.category] ?? 999)
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [filteredItems, sortDirection, sortField])

  const { effectivePerPage, totalPages, needsPagination, paginatedItems } = useMemo(() => {
    const effectiveLimit = itemsPerPage === 'unlimited' ? sortedItems.length : itemsPerPage
    const pageCount = Math.ceil(sortedItems.length / effectiveLimit) || 1
    const shouldPaginate = itemsPerPage !== 'unlimited' && sortedItems.length > effectiveLimit
    const items = itemsPerPage === 'unlimited'
      ? sortedItems
      : sortedItems.slice((currentPage - 1) * effectiveLimit, (currentPage - 1) * effectiveLimit + effectiveLimit)

    return {
      effectivePerPage: effectiveLimit,
      totalPages: pageCount,
      needsPagination: shouldPaginate,
      paginatedItems: items,
    }
  }, [currentPage, itemsPerPage, sortedItems])

  useEffect(() => {
    setCurrentPage(1)
  }, [localClusterFilter, search, sortField])

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const toggleClusterFilter = useCallback((cluster: string) => {
    setLocalClusterFilter(prev =>
      prev.includes(cluster) ? prev.filter(entry => entry !== cluster) : [...prev, cluster],
    )
  }, [])

  const clearClusterFilter = useCallback(() => {
    setLocalClusterFilter([])
  }, [])

  const filteredOfflineCount = useMemo(() => sortedItems.filter(item => item.category === 'offline').length, [sortedItems])
  const filteredGpuCount = useMemo(() => sortedItems.filter(item => item.category === 'gpu').length, [sortedItems])
  const filteredPredictionCount = useMemo(() => sortedItems.filter(item => item.category === 'prediction').length, [sortedItems])

  const rootCauseGroups = useMemo((): RootCauseGroup[] => {
    const groups = new Map<string, RootCauseGroup>()

    sortedItems.forEach(item => {
      let groupKey: string
      let groupDetails: string

      if (item.rootCause) {
        groupKey = item.rootCause.cause
        groupDetails = item.rootCause.details
      } else if (item.category === 'gpu') {
        groupKey = 'GPU exhaustion'
        groupDetails = 'No GPUs available on these nodes'
      } else if (item.category === 'prediction') {
        const risk = item.predictionData
        if (risk?.type === 'pod-crash') {
          groupKey = 'Pod crash risk'
          groupDetails = 'Pods with high restart counts likely to crash again'
        } else if (risk?.type === 'resource-exhaustion') {
          groupKey = risk.metric === 'cpu' ? 'CPU pressure' : 'Memory pressure'
          groupDetails = `Clusters approaching ${risk.metric?.toUpperCase()} limits`
        } else if (risk?.type === 'gpu-exhaustion') {
          groupKey = 'GPU capacity risk'
          groupDetails = 'GPU nodes at full capacity with no headroom'
        } else {
          groupKey = 'AI-detected risk'
          groupDetails = risk?.reason || 'Anomaly detected by AI analysis'
        }
      } else {
        groupKey = item.reason || 'Unknown'
        groupDetails = item.reasonDetailed || item.reason
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          cause: groupKey,
          details: groupDetails,
          items: [],
          severity: item.severity,
          categories: new Set(),
        })
      }

      const group = groups.get(groupKey)
      if (!group) return
      group.items.push(item)
      group.categories.add(item.category)
      if (item.severity === 'critical') group.severity = 'critical'
      else if (item.severity === 'warning' && group.severity === 'info') group.severity = 'warning'
    })

    return Array.from(groups.values()).sort((a, b) => {
      if (b.items.length !== a.items.length) return b.items.length - a.items.length
      return (ALERT_SEVERITY_ORDER as Record<string, number>)[a.severity] - (ALERT_SEVERITY_ORDER as Record<string, number>)[b.severity]
    })
  }, [sortedItems])

  const toggleGroupExpand = useCallback((cause: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(cause)) next.delete(cause)
      else next.add(cause)
      return next
    })
  }, [])

  const filteredTotalIssues = filteredOfflineCount + filteredGpuCount
  const filteredTotalPredicted = filteredPredictionCount
  const filteredCriticalPredicted = useMemo(
    () => sortedItems.filter(item => item.category === 'prediction' && item.predictionData?.severity === 'critical').length,
    [sortedItems],
  )
  const filteredAIPredictionCount = useMemo(
    () => sortedItems.filter(item => item.category === 'prediction' && item.predictionData?.source === 'ai').length,
    [sortedItems],
  )
  const isFiltered = search.trim() !== '' || localClusterFilter.length > 0

  const startAnalysis = useCallback(() => {
    const filteredOfflineItems = isFiltered
      ? sortedItems.filter(item => item.category === 'offline')
      : unifiedItems.filter(item => item.category === 'offline')
    const filteredOfflineNodes = filteredOfflineItems
      .map(item => item.nodeData)
      .filter((node): node is NonNullable<typeof node> => !!node)
    const filteredClusterHealthIssues = filteredOfflineItems
      .map(item => item.clusterIssueData)
      .filter((issue): issue is NonNullable<typeof issue> => !!issue)
    const filteredGpuIssues = isFiltered
      ? sortedItems.filter(item => item.category === 'gpu' && item.gpuData).map(item => item.gpuData) as GpuIssue[]
      : gpuIssues
    const filteredPredictedRisks = isFiltered
      ? sortedItems.filter(item => item.category === 'prediction' && item.predictionData).map(item => item.predictionData) as PredictedRisk[]
      : predictedRisks

    const nodesSummary = filteredOfflineNodes.map(node => {
      const item = filteredOfflineItems.find(entry => entry.nodeData?.name === node.name && entry.nodeData?.cluster === node.cluster)
      const rootCause = item?.rootCause
      let line = `- Node ${node.name} (${node.cluster || 'unknown'}): Status=${node.unschedulable ? 'Cordoned' : node.status}`
      if (rootCause) {
        line += `\n  Root Cause: ${rootCause.cause}`
        line += `\n  Details: ${rootCause.details}`
      }
      return line
    }).join('\n')

    const clusterHealthSummary = filteredClusterHealthIssues.map(issue =>
      `- Cluster ${issue.cluster}: ${issue.reason}${issue.reasonDetailed ? `\n  Details: ${issue.reasonDetailed}` : ''}`,
    ).join('\n')

    const gpuSummary = filteredGpuIssues.map(issue =>
      `- Node ${issue.nodeName} (${issue.cluster}): ${issue.reason}`,
    ).join('\n')

    const predictedSummary = filteredPredictedRisks.map(risk => {
      const sourceLabel = risk.source === 'ai' ? `AI (${risk.confidence || 0}% confidence)` : 'Heuristic'
      const trendLabel = risk.trend ? ` [${risk.trend}]` : ''
      let entry = `- [${risk.severity.toUpperCase()}] [${sourceLabel}]${trendLabel} ${risk.name} (${risk.cluster || 'unknown'}):\n  Summary: ${risk.reason}`
      if (risk.reasonDetailed) {
        entry += `\n  Details: ${risk.reasonDetailed}`
      }
      return entry
    }).join('\n\n')

    const filteredAICount = filteredPredictedRisks.filter(risk => risk.source === 'ai').length
    const filteredHeuristicCount = filteredPredictedRisks.filter(risk => risk.source === 'heuristic').length
    const hasCurrentIssues = filteredTotalIssues > 0
    const hasPredictions = filteredTotalPredicted > 0

    startMission({
      title: hasPredictions && !hasCurrentIssues ? 'Predictive Health Analysis' : 'Health Issue Analysis',
      description: hasCurrentIssues
        ? `Analyzing ${filteredTotalIssues} issues${hasPredictions ? ` + ${filteredTotalPredicted} predicted risks` : ''}`
        : `Analyzing ${filteredTotalPredicted} predicted failure risks (${filteredAICount} AI, ${filteredHeuristicCount} heuristic)`,
      type: 'troubleshoot',
      initialPrompt: `I need help analyzing ${hasCurrentIssues ? 'current issues and ' : ''}potential failures in my Kubernetes clusters.

${hasCurrentIssues ? `**Current Cluster Health Issues (${filteredClusterHealthIssues.length}):**
${clusterHealthSummary || 'None detected'}

**Current Node Issues (${filteredOfflineNodes.length}):**
${nodesSummary || 'None detected'}

**Current GPU Issues (${filteredGpuIssues.length}):**
${gpuSummary || 'None detected'}

` : ''}**Predicted Failure Risks (${filteredTotalPredicted} total: ${filteredAICount} AI-detected, ${filteredHeuristicCount} threshold-based):**
${predictedSummary || 'None predicted'}

Please:
1. ${hasCurrentIssues ? 'Identify root causes for the current cluster and node issues' : 'Analyze the predicted risks and their likelihood'}
2. ${hasPredictions ? 'Assess the predicted failures - which are most likely to occur? Consider the AI confidence levels and trends.' : 'Check for patterns in the current issues'}
3. Provide preventive actions to avoid predicted failures
4. ${hasCurrentIssues ? 'Provide remediation steps for the current issues' : 'Recommend monitoring thresholds to catch issues earlier'}
5. Prioritize by severity and potential impact
6. Suggest proactive measures to prevent future failures`,
      context: {
        offlineNodes: filteredOfflineNodes.slice(0, 20),
        clusterHealthIssues: filteredClusterHealthIssues.slice(0, 20),
        gpuIssues: filteredGpuIssues,
        predictedRisks: filteredPredictedRisks.slice(0, 20),
        affectedClusters: new Set([
          ...filteredOfflineNodes.map(node => node.cluster || 'unknown'),
          ...filteredClusterHealthIssues.map(issue => issue.cluster),
          ...filteredGpuIssues.map(issue => issue.cluster),
        ]).size,
        criticalPredicted: filteredCriticalPredicted,
        aiPredictionCount: filteredAICount,
        heuristicPredictionCount: filteredHeuristicCount,
      },
    })
  }, [
    filteredCriticalPredicted,
    filteredTotalIssues,
    filteredTotalPredicted,
    gpuIssues,
    isFiltered,
    predictedRisks,
    sortedItems,
    startMission,
    unifiedItems,
  ])

  return (
    <>
      <CardControlsRow
        clusterFilter={{
          availableClusters: availableClustersForFilter.map(cluster => ({ name: cluster })),
          selectedClusters: localClusterFilter,
          onToggle: toggleClusterFilter,
          onClear: clearClusterFilter,
          isOpen: showClusterFilter,
          setIsOpen: setShowClusterFilter,
          containerRef: clusterFilterRef,
          minClusters: 1,
        }}
        clusterIndicator={localClusterFilter.length > 0 ? {
          selectedCount: localClusterFilter.length,
          totalCount: availableClustersForFilter.length,
        } : undefined}
        cardControls={{
          limit: itemsPerPage,
          onLimitChange: setItemsPerPage,
          sortBy: sortField,
          sortOptions: SORT_OPTIONS,
          onSortChange: value => setSortField(value as SortField),
          sortDirection,
          onSortDirectionChange: setSortDirection,
        }}
      />

      <div className="flex items-center gap-2 mb-3">
        <CardSearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('common:common.searchIssues')}
          className="flex-1 mb-0!"
        />
        {rootCauseGroups.length > 0 && rootCauseGroups.some(group => group.items.length > 1) && (
          <div className="flex bg-secondary/50 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-1.5 rounded transition-colors',
                viewMode === 'list' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              title="List view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={cn(
                'p-1.5 rounded transition-colors',
                viewMode === 'grouped' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              title="Group by root cause - see which fixes solve multiple issues"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto mb-2">
        <DynamicCardErrorBoundary
          cardId="ConsoleOfflineDetectionAI"
          fallbackTitle={t('cards:consoleOfflineDetection.aiRenderErrorTitle')}
          fallbackMessage={t('cards:consoleOfflineDetection.aiRenderErrorDescription')}
        >
          {viewMode === 'grouped' ? (
            <RootCauseAnalyzer
              rootCauseGroups={rootCauseGroups}
              expandedGroups={expandedGroups}
              toggleGroupExpand={toggleGroupExpand}
              search={search}
              localClusterFilter={localClusterFilter}
              drillToNode={drillToNode}
              drillToCluster={drillToCluster}
              startMission={startMission as (config: { title: string; description: string; type: string; initialPrompt: string; context: Record<string, unknown> }) => void}
            />
          ) : (
            <UnifiedItemsList
              paginatedItems={paginatedItems}
              sortedItemsLength={sortedItems.length}
              search={search}
              localClusterFilter={localClusterFilter}
              drillToNode={drillToNode}
              drillToCluster={drillToCluster}
              getFeedback={getFeedback}
              submitFeedback={submitFeedback}
            />
          )}
        </DynamicCardErrorBoundary>
      </div>

      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={sortedItems.length}
        itemsPerPage={effectivePerPage}
        onPageChange={setCurrentPage}
        needsPagination={needsPagination}
      />

      <AIAnalysisPanel
        filteredTotalIssues={filteredTotalIssues}
        filteredTotalPredicted={filteredTotalPredicted}
        filteredOfflineCount={filteredOfflineCount}
        filteredAIPredictionCount={filteredAIPredictionCount}
        isFiltered={isFiltered}
        runningMission={runningMission}
        onStartAnalysis={() => checkKeyAndRun(startAnalysis)}
      />
    </>
  )
}
