import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCardDemoState, useCardLoadingState } from '../CardDataContext'
import { useClusters } from '../../../hooks/useMCP'
import { useCachedGPUNodes, useCachedPodIssues } from '../../../hooks/useCachedData'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { usePredictionSettings } from '../../../hooks/usePredictionSettings'
import { useAIPredictions } from '../../../hooks/useAIPredictions'
import { usePredictionFeedback } from '../../../hooks/usePredictionFeedback'
import { useMetricsHistory } from '../../../hooks/useMetricsHistory'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { FETCH_DEFAULT_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants'
import { POLL_INTERVAL_MS } from '../../../lib/constants/network'
import { agentFetch } from '../../../hooks/mcp/shared'
import { useClusterFiltering } from '../../clusters/useClusterFiltering'
import { getClusterHealthState, isClusterTokenExpired } from '../../clusters/utils'
import type { PredictedRisk, PredictionSettings } from '../../../types/predictions'
import {
  type ClusterHealthIssue,
  type GpuIssue,
  type NodeData,
  buildOfflineDetectionCardLoadState,
  generatePredictionId,
} from './offlineDataTransforms'

let nodesCache: NodeData[] = []
let nodesCacheTimestamp = 0
let nodesFetchInProgress = false
let nodesFetchError: string | null = null
let nodesFetchConsecutiveFailures = 0
const nodesSubscribers = new Set<(nodes: NodeData[]) => void>()

const NODES_CACHE_TTL_MS = 30_000
const OFFLINE_DETECTION_FAILURE_THRESHOLD = 3
const GPU_CLUSTER_EXHAUSTION_THRESHOLD = 0.8

type NodesFetchResult = {
  nodes: NodeData[]
  error: string | null
  consecutiveFailures: number
}

function notifyNodesSubscribers() {
  nodesSubscribers.forEach(callback => callback(nodesCache))
}

async function fetchAllNodes(): Promise<NodesFetchResult> {
  if (Date.now() - nodesCacheTimestamp < NODES_CACHE_TTL_MS && nodesCache.length > 0) {
    return { nodes: nodesCache, error: null, consecutiveFailures: 0 }
  }

  if (nodesFetchInProgress) {
    return {
      nodes: nodesCache,
      error: nodesFetchError,
      consecutiveFailures: nodesFetchConsecutiveFailures,
    }
  }

  nodesFetchInProgress = true
  try {
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/nodes`, {
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json() as { nodes?: NodeData[] }
    nodesCache = data.nodes || []
    nodesCacheTimestamp = Date.now()
    nodesFetchError = null
    nodesFetchConsecutiveFailures = 0
    notifyNodesSubscribers()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    nodesFetchConsecutiveFailures += 1
    nodesFetchError = message

    const isJsonParseError = message.includes('Unexpected token') || message.includes('JSON')
    const shouldLogError = nodesFetchConsecutiveFailures <= OFFLINE_DETECTION_FAILURE_THRESHOLD || !isJsonParseError

    if (nodesCache.length > 0) {
      if (shouldLogError) {
        console.warn('[OfflineDetection] Node fetch degraded:', message)
      }
    } else if (shouldLogError) {
      console.error('[OfflineDetection] Error fetching nodes:', error)
    }
  } finally {
    nodesFetchInProgress = false
  }

  return {
    nodes: nodesCache,
    error: nodesFetchError,
    consecutiveFailures: nodesFetchConsecutiveFailures,
  }
}

export type OfflineDetectionThresholds = PredictionSettings['thresholds']

export function useOfflineDetection() {
  const { t } = useTranslation(['cards', 'common'])
  const {
    nodes: gpuNodes,
    isLoading: gpuLoading,
    isRefreshing: gpuRefreshing,
    isDemoFallback: gpuDemoFallback,
    isFailed: gpuFailed,
    consecutiveFailures: gpuFailures,
  } = useCachedGPUNodes()
  const {
    issues: podIssues,
    isLoading: podsLoading,
    isRefreshing: podsRefreshing,
    isDemoFallback: podsDemoFallback,
    isFailed: podsFailed,
    consecutiveFailures: podsFailures,
  } = useCachedPodIssues()
  const { deduplicatedClusters: clusters } = useClusters()
  const {
    selectedClusters,
    isAllClustersSelected,
    customFilter,
    selectedDistributions,
    isAllDistributionsSelected,
  } = useGlobalFilters()
  const { shouldUseDemoData } = useCardDemoState({ requires: 'agent' })
  const { isDemoMode } = useDemoMode()
  const { settings: predictionSettings } = usePredictionSettings()
  const {
    predictions: aiPredictions,
    isAnalyzing,
    analyze: triggerAIAnalysis,
    isEnabled: aiEnabled,
  } = useAIPredictions()
  const { submitFeedback, getFeedback } = usePredictionFeedback()
  const { getClusterTrend, getPodRestartTrend } = useMetricsHistory()
  const thresholds = predictionSettings.thresholds
  const [allNodes, setAllNodes] = useState<NodeData[]>(() => nodesCache)
  const [nodesLoading, setNodesLoading] = useState(() => !shouldUseDemoData && nodesCache.length === 0)
  const [nodesRefreshing, setNodesRefreshing] = useState(false)
  const [nodesFailures, setNodesFailures] = useState(0)

  const cardLoadState = useMemo(
    () => buildOfflineDetectionCardLoadState([
      {
        hasData: allNodes.length > 0,
        isLoading: !shouldUseDemoData && nodesLoading,
        isRefreshing: !shouldUseDemoData && nodesRefreshing,
        consecutiveFailures: shouldUseDemoData ? 0 : nodesFailures,
        isFailed: !shouldUseDemoData && nodesFailures >= OFFLINE_DETECTION_FAILURE_THRESHOLD,
      },
      {
        hasData: (gpuNodes || []).length > 0,
        isLoading: gpuLoading,
        isRefreshing: gpuRefreshing,
        isDemoData: gpuDemoFallback,
        isFailed: gpuFailed,
        consecutiveFailures: gpuFailures,
      },
      {
        hasData: (podIssues || []).length > 0,
        isLoading: podsLoading,
        isRefreshing: podsRefreshing,
        isDemoData: podsDemoFallback,
        isFailed: podsFailed,
        consecutiveFailures: podsFailures,
      },
    ], shouldUseDemoData || isDemoMode),
    [
      allNodes.length,
      gpuDemoFallback,
      gpuFailed,
      gpuFailures,
      gpuLoading,
      gpuNodes,
      gpuRefreshing,
      isDemoMode,
      nodesFailures,
      nodesLoading,
      nodesRefreshing,
      podIssues,
      podsDemoFallback,
      podsFailed,
      podsFailures,
      podsLoading,
      podsRefreshing,
      shouldUseDemoData,
    ],
  )

  useCardLoadingState(cardLoadState)

  useEffect(() => {
    if (shouldUseDemoData) {
      return
    }

    let isMounted = true
    const handleUpdate = (nodes: NodeData[]) => {
      if (!isMounted) return
      setAllNodes(nodes)
      setNodesLoading(false)
    }

    nodesSubscribers.add(handleUpdate)

    const refreshNodes = () => {
      if (!isMounted) return
      setNodesRefreshing(nodesCache.length > 0)

      fetchAllNodes()
        .then(result => {
          if (!isMounted) return
          setAllNodes(result.nodes)
          setNodesLoading(false)
          setNodesRefreshing(false)
          setNodesFailures(result.consecutiveFailures)
        })
        .catch(() => {
          if (!isMounted) return
          setNodesRefreshing(false)
        })
    }

    refreshNodes()
    const interval = setInterval(refreshNodes, POLL_INTERVAL_MS)

    return () => {
      isMounted = false
      nodesSubscribers.delete(handleUpdate)
      clearInterval(interval)
    }
  }, [shouldUseDemoData])

  const { globalFilteredClusters } = useClusterFiltering({
    clusters,
    filter: 'all',
    globalSelectedClusters: selectedClusters,
    isAllClustersSelected,
    customFilter,
    selectedDistributions,
    isAllDistributionsSelected,
    sortBy: 'name',
    sortAsc: true,
    customOrder: [],
  })

  const nodes = useMemo(() => {
    let result = allNodes

    if (!isAllClustersSelected) {
      result = result.filter(node => !node.cluster || selectedClusters.includes(node.cluster))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(node =>
        node.name.toLowerCase().includes(query) ||
        (node.cluster?.toLowerCase() || '').includes(query),
      )
    }

    return result
  }, [allNodes, customFilter, isAllClustersSelected, selectedClusters])

  const offlineNodes = useMemo(() => {
    const unhealthy = nodes.filter(node => node.status !== 'Ready' || node.unschedulable === true)
    const byName = new Map<string, NodeData>()

    unhealthy.forEach(node => {
      const existing = byName.get(node.name)
      if (!existing || (node.cluster?.length || 999) < (existing.cluster?.length || 999)) {
        byName.set(node.name, node)
      }
    })

    return Array.from(byName.values())
  }, [nodes])

  const clusterHealthIssues = useMemo((): ClusterHealthIssue[] => {
    const clustersWithOfflineNodes = new Set(
      offlineNodes
        .map(node => node.cluster)
        .filter((clusterName): clusterName is string => !!clusterName),
    )

    return (globalFilteredClusters || []).flatMap((cluster): ClusterHealthIssue[] => {
      if (clustersWithOfflineNodes.has(cluster.name)) {
        return []
      }

      const state = getClusterHealthState(cluster)
      if (state === 'unhealthy') {
        return [{
          cluster: cluster.name,
          state,
          reason: t('common:common.unhealthy'),
          reasonDetailed: cluster.errorMessage || t('cards:clusterHealth.clusterHasIssues'),
          severity: 'warning',
        }]
      }

      if (state === 'unreachable') {
        return [{
          cluster: cluster.name,
          state,
          reason: t('common:common.offline'),
          reasonDetailed: isClusterTokenExpired(cluster)
            ? t('cards:clusterHealth.tokenExpired')
            : (cluster.errorMessage || t('cards:clusterHealth.offlineCheckNetwork')),
          severity: 'critical',
        }]
      }

      return []
    })
  }, [globalFilteredClusters, offlineNodes, t])

  const gpuIssues = useMemo((): GpuIssue[] => {
    const issues: GpuIssue[] = []
    const filteredGpuNodes = isAllClustersSelected
      ? (gpuNodes || [])
      : (gpuNodes || []).filter(node => selectedClusters.includes(node.cluster))

    filteredGpuNodes.forEach(node => {
      if (node.gpuCount === 0 && node.gpuType) {
        issues.push({
          cluster: node.cluster,
          nodeName: node.name,
          expected: -1,
          available: 0,
          reason: `GPU node showing 0 GPUs (type: ${node.gpuType})`,
        })
      }
    })

    return issues
  }, [gpuNodes, isAllClustersSelected, selectedClusters])

  const heuristicPredictions = useMemo(() => {
    const risks: PredictedRisk[] = []
    const filteredPodIssues = isAllClustersSelected
      ? (podIssues || [])
      : (podIssues || []).filter(pod => selectedClusters.includes(pod.cluster || ''))

    filteredPodIssues.forEach(pod => {
      if (pod.restarts && pod.restarts >= thresholds.highRestartCount) {
        const trend = getPodRestartTrend(pod.name, pod.cluster || '')
        risks.push({
          id: generatePredictionId('pod-crash', pod.name, pod.cluster),
          type: 'pod-crash',
          severity: pod.restarts >= 5 ? 'critical' : 'warning',
          name: pod.name,
          cluster: pod.cluster,
          namespace: pod.namespace,
          reason: `${pod.restarts} restarts - likely to crash`,
          reasonDetailed: `Pod has restarted ${pod.restarts} times, which indicates instability. This typically suggests memory pressure (OOMKill), application bugs, or configuration issues. Recommended actions: Check pod logs with 'kubectl logs ${pod.name}', describe the pod to see recent events, and review resource limits.`,
          metric: `${pod.restarts} restarts`,
          source: 'heuristic',
          trend,
        })
      }
    })

    const filteredClusters = isAllClustersSelected
      ? (clusters || [])
      : (clusters || []).filter(cluster => selectedClusters.includes(cluster.name))

    filteredClusters.forEach(cluster => {
      if (cluster.cpuCores && cluster.cpuUsageCores) {
        const cpuPercent = (cluster.cpuUsageCores / cluster.cpuCores) * 100
        if (cpuPercent >= thresholds.cpuPressure) {
          const trend = getClusterTrend(cluster.name, 'cpuPercent')
          risks.push({
            id: generatePredictionId('resource-exhaustion-cpu', cluster.name, cluster.name),
            type: 'resource-exhaustion',
            severity: cpuPercent >= 90 ? 'critical' : 'warning',
            name: cluster.name,
            cluster: cluster.name,
            reason: `CPU at ${cpuPercent.toFixed(0)}% - risk of throttling`,
            reasonDetailed: `Cluster CPU utilization is at ${cpuPercent.toFixed(1)}%, above the ${thresholds.cpuPressure}% warning threshold. At this level, workloads may experience throttling, increased latency, and degraded performance. Consider scaling up nodes, optimizing resource-intensive workloads, or implementing CPU limits.`,
            metric: `${cpuPercent.toFixed(0)}% CPU`,
            source: 'heuristic',
            trend,
          })
        }
      }

      if (cluster.memoryGB && cluster.memoryUsageGB) {
        const memoryPercent = (cluster.memoryUsageGB / cluster.memoryGB) * 100
        if (memoryPercent >= thresholds.memoryPressure) {
          const trend = getClusterTrend(cluster.name, 'memoryPercent')
          risks.push({
            id: generatePredictionId('resource-exhaustion-mem', cluster.name, cluster.name),
            type: 'resource-exhaustion',
            severity: memoryPercent >= 95 ? 'critical' : 'warning',
            name: cluster.name,
            cluster: cluster.name,
            reason: `Memory at ${memoryPercent.toFixed(0)}% - risk of OOM`,
            reasonDetailed: `Cluster memory utilization is at ${memoryPercent.toFixed(1)}%, above the ${thresholds.memoryPressure}% warning threshold. Pods may be OOMKilled, nodes may become unschedulable, and new deployments may fail. Consider scaling up memory, reviewing memory limits, or identifying memory leaks.`,
            metric: `${memoryPercent.toFixed(0)}% memory`,
            source: 'heuristic',
            trend,
          })
        }
      }
    })

    const filteredGpuNodes = isAllClustersSelected
      ? (gpuNodes || [])
      : (gpuNodes || []).filter(node => selectedClusters.includes(node.cluster))
    const clusterGpuTotals = new Map<string, { total: number; allocated: number }>()

    filteredGpuNodes.forEach(node => {
      if (node.gpuCount > 0) {
        const entry = clusterGpuTotals.get(node.cluster) || { total: 0, allocated: 0 }
        entry.total += node.gpuCount
        entry.allocated += node.gpuAllocated
        clusterGpuTotals.set(node.cluster, entry)
      }
    })

    clusterGpuTotals.forEach((gpus, cluster) => {
      if (gpus.allocated > gpus.total) {
        risks.push({
          id: generatePredictionId('gpu-over-allocated', cluster, cluster),
          type: 'gpu-exhaustion',
          severity: 'critical',
          name: cluster,
          cluster,
          reason: `GPU over-allocation: ${gpus.allocated}/${gpus.total}`,
          reasonDetailed: `Cluster ${cluster} has more GPUs allocated (${gpus.allocated}) than available (${gpus.total}). This may cause scheduling failures or workload evictions.`,
          metric: `${gpus.allocated}/${gpus.total} GPUs`,
          source: 'heuristic',
        })
      } else if (gpus.total > 0 && gpus.allocated / gpus.total > GPU_CLUSTER_EXHAUSTION_THRESHOLD) {
        const percentAllocated = Math.round((gpus.allocated / gpus.total) * 100)
        risks.push({
          id: generatePredictionId('gpu-exhaustion', cluster, cluster),
          type: 'gpu-exhaustion',
          severity: 'warning',
          name: cluster,
          cluster,
          reason: `Cluster GPU capacity ${percentAllocated}% allocated`,
          reasonDetailed: `Cluster ${cluster} has ${gpus.allocated} of ${gpus.total} GPUs allocated (${percentAllocated}%). New GPU workloads may not schedule. Consider adding GPU nodes or optimizing utilization.`,
          metric: `${gpus.allocated}/${gpus.total} GPUs (${percentAllocated}%)`,
          source: 'heuristic',
        })
      }
    })

    return risks
  }, [
    clusters,
    getClusterTrend,
    getPodRestartTrend,
    gpuNodes,
    isAllClustersSelected,
    podIssues,
    selectedClusters,
    thresholds,
  ])

  const predictedRisks = useMemo(() => {
    const filteredAIPredictions = aiEnabled
      ? (aiPredictions || []).filter(prediction =>
          isAllClustersSelected || !prediction.cluster || selectedClusters.includes(prediction.cluster),
        )
      : []
    const allRisks = [...heuristicPredictions, ...filteredAIPredictions]
    const uniqueRisks = allRisks.reduce((accumulator, risk) => {
      const key = `${risk.type}-${risk.name}-${risk.cluster || 'unknown'}`
      const existing = accumulator.get(key)
      if (!existing) {
        accumulator.set(key, risk)
      } else if (risk.source === 'ai' && existing.source === 'heuristic') {
        accumulator.set(key, risk)
      } else if (existing.severity === 'warning' && risk.severity === 'critical') {
        accumulator.set(key, risk)
      }
      return accumulator
    }, new Map<string, PredictedRisk>())

    return Array.from(uniqueRisks.values()).sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'critical' ? -1 : 1
      }
      if (a.source !== b.source) {
        return a.source === 'ai' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  }, [aiEnabled, aiPredictions, heuristicPredictions, isAllClustersSelected, selectedClusters])

  return {
    offlineNodes,
    clusterHealthIssues,
    gpuIssues,
    predictedRisks,
    totalPredicted: predictedRisks.length,
    criticalPredicted: predictedRisks.filter(risk => risk.severity === 'critical').length,
    aiPredictionCount: predictedRisks.filter(risk => risk.source === 'ai').length,
    heuristicPredictionCount: predictedRisks.filter(risk => risk.source === 'heuristic').length,
    currentClusterIssueCount: offlineNodes.length + clusterHealthIssues.length,
    firstCurrentIssueCluster: offlineNodes[0]?.cluster || clusterHealthIssues[0]?.cluster || null,
    thresholds,
    predictionInterval: predictionSettings.interval,
    aiEnabled,
    isAnalyzing,
    triggerAIAnalysis,
    submitFeedback,
    getFeedback,
  }
}
