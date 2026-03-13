/**
 * AlertsDataFetcher — lazy-loaded bridge that calls MCP hooks and pushes
 * data into AlertsContext.  Keeping the MCP imports here (instead of in
 * AlertsContext.tsx) prevents the 300 KB MCP hook tree from being bundled
 * into the main chunk.  This component renders nothing visible.
 */

import { useEffect } from 'react'
import { useGPUNodes, usePodIssues, useClusters } from '../hooks/useMCP'
import { useCachedStorageAnalysis } from '../hooks/useCachedData'
import type { StorageAnalysis } from '../hooks/mcp/types'

export interface AlertsMCPData {
  gpuNodes: ReturnType<typeof useGPUNodes>['nodes']
  podIssues: ReturnType<typeof usePodIssues>['issues']
  clusters: ReturnType<typeof useClusters>['deduplicatedClusters']
  storageAnalyses: StorageAnalysis[]
  isLoading: boolean
  error: string | null
}

interface Props {
  onData: (data: AlertsMCPData) => void
}

export default function AlertsDataFetcher({ onData }: Props) {
  const { nodes: gpuNodes, isLoading: isGPULoading, error: gpuError } = useGPUNodes()
  const { issues: podIssues, isLoading: isPodIssuesLoading, error: podIssuesError } = usePodIssues()
  const { deduplicatedClusters: clusters, isLoading: isClustersLoading, error: clustersError } = useClusters()
  const { analyses: storageAnalyses, isLoading: isStorageLoading, error: storageError } = useCachedStorageAnalysis()

  useEffect(() => {
    const errors = [gpuError, podIssuesError, clustersError, storageError].filter(Boolean)
    onData({
      gpuNodes: gpuNodes || [],
      podIssues: podIssues || [],
      clusters: clusters || [],
      storageAnalyses: storageAnalyses || [],
      isLoading: isGPULoading || isPodIssuesLoading || isClustersLoading || isStorageLoading,
      error: errors.length > 0 ? (errors || []).join('; ') : null,
    })
  }, [gpuNodes, podIssues, clusters, storageAnalyses, isGPULoading, isPodIssuesLoading, isClustersLoading, isStorageLoading, gpuError, podIssuesError, clustersError, storageError, onData])

  return null
}
