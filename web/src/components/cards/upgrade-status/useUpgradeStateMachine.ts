import { useState, useEffect, useRef } from 'react'
import type { Cluster } from '../../../types/cluster'
import {
  getCachedVersion,
  getStaleCachedVersion,
  clearCachedVersion,
  flushVersionCache,
  getDemoVersionForCluster,
  VERSION_CACHE_TTL,
} from './upgradeHelpers'
import type { UseUpgradeWebSocketResult } from './useUpgradeWebSocket'

interface VersionState {
  clusterVersions: Record<string, string>
  fetchCompleted: boolean
}

/** Retry interval for failed cluster version fetches */
const RETRY_INTERVAL_MS = 15000

export interface UseUpgradeStateMachineParams {
  allClusters: Cluster[]
  agentConnected: boolean
  isDemoMode: boolean
  wsHandle: UseUpgradeWebSocketResult['wsHandle']
}

export interface UseUpgradeStateMachineResult {
  clusterVersions: Record<string, string>
  fetchCompleted: boolean
}

/**
 * Hook that manages the state machine for tracking cluster versions.
 * Handles fetching, caching, retrying failed fetches, and periodic refreshes.
 */
export function useUpgradeStateMachine({
  allClusters,
  agentConnected,
  isDemoMode,
  wsHandle,
}: UseUpgradeStateMachineParams): UseUpgradeStateMachineResult {
  const [{ clusterVersions, fetchCompleted }, setVersionState] = useState<VersionState>({
    clusterVersions: {},
    fetchCompleted: false,
  })

  // Track previous agent connection state to detect reconnections
  const prevAgentConnectedRef = useRef(agentConnected)

  // Use a ref to track which clusters we've already fetched successfully
  const fetchedClustersRef = useRef(new Set<string>())
  // Track clusters that failed to fetch for retry
  const failedClustersRef = useRef(new Set<string>())

  // Clear fetch cache when agent reconnects (was disconnected, now connected)
  useEffect(() => {
    if (agentConnected && !prevAgentConnectedRef.current) {
      // Agent just reconnected - clear the fetch cache to re-fetch all versions
      fetchedClustersRef.current.clear()
      failedClustersRef.current.clear()
    }
    prevAgentConnectedRef.current = agentConnected
  }, [agentConnected])

  // Populate demo versions when in demo mode
  const demoVersionsSetRef = useRef(false)
  useEffect(() => {
    if (!isDemoMode || allClusters.length === 0) return
    if (demoVersionsSetRef.current) return
    demoVersionsSetRef.current = true
    const demoVersions: Record<string, string> = {}
    for (const c of allClusters) {
      demoVersions[c.name] = getDemoVersionForCluster(c.name)
    }
    setVersionState(prev => ({ ...prev, clusterVersions: demoVersions, fetchCompleted: true }))
  }, [isDemoMode, allClusters])

  // Fetch real versions from clusters via local agent
  useEffect(() => {
    if (isDemoMode) return // Demo versions handled above

    if (!agentConnected || allClusters.length === 0) {
      // If not connected, mark fetch as completed so we show '-' instead of 'loading...'
      // But preserve any cached versions we already have
      setVersionState(prev => ({ ...prev, fetchCompleted: true }))
      return
    }

    let cancelled = false
    setVersionState(prev => ({ ...prev, fetchCompleted: false }))

    const fetchVersions = async () => {
      // Only fetch for healthy/reachable clusters that we haven't cached yet
      const reachableClusters = allClusters.filter(c => c.healthy !== false && c.nodeCount && c.nodeCount > 0)

      // Determine which clusters need fetching (not cached, or previously failed)
      const clustersToFetch = reachableClusters.filter(c =>
        !fetchedClustersRef.current.has(c.name) || failedClustersRef.current.has(c.name)
      )

      if (clustersToFetch.length === 0) {
        if (!cancelled) setVersionState(prev => ({ ...prev, fetchCompleted: true }))
        return
      }

      // Fetch all clusters in parallel for faster loading
      if (!wsHandle) return
      const fetchPromises = clustersToFetch.map(async (cluster) => {
        const version = await wsHandle.fetchClusterVersion(cluster.name)
        return { name: cluster.name, version }
      })

      const results = await Promise.all(fetchPromises)
      if (cancelled) return

      // Process results
      const newVersions: Record<string, string> = {}
      let hasNewData = false

      for (const { name, version } of results) {
        if (version) {
          newVersions[name] = version
          fetchedClustersRef.current.add(name)
          failedClustersRef.current.delete(name)
          hasNewData = true
        } else {
          // Track failed clusters for retry on next cycle
          failedClustersRef.current.add(name)
        }
      }

      // Merge new versions with existing, preserving cache
      setVersionState(prev => ({
        ...prev,
        clusterVersions: hasNewData ? { ...prev.clusterVersions, ...newVersions } : prev.clusterVersions,
        fetchCompleted: true,
      }))
    }

    fetchVersions()

    // Retry failed clusters every 15 seconds
    const retryInterval = setInterval(() => {
      if (failedClustersRef.current.size > 0 && agentConnected) {
        fetchVersions()
      }
    }, RETRY_INTERVAL_MS)

    // #6292: re-fetch ALL clusters on VERSION_CACHE_TTL so a successfully
    // upgraded cluster reflects its new version. Without this loop,
    // `fetchedClustersRef` kept the old cluster in the "already fetched,
    // skip" set forever and the card showed the pre-upgrade version
    // until the user navigated away and came back. Also clears the
    // per-cluster version cache so `getCachedVersion()` re-fetches.
    const refreshInterval = setInterval(() => {
      if (!agentConnected) return
      fetchedClustersRef.current.clear()
      for (const c of allClusters) {
        clearCachedVersion(c.name)
      }
      flushVersionCache()
      fetchVersions()
    }, VERSION_CACHE_TTL)

    return () => {
      cancelled = true
      clearInterval(retryInterval)
      clearInterval(refreshInterval)
    }
  }, [isDemoMode, agentConnected, allClusters, wsHandle])

  return { clusterVersions, fetchCompleted }
}

export interface UpgradeItem {
  name: string
  currentVersion: string
  targetVersion: string
  status: 'unreachable' | 'loading' | 'available' | 'current'
  progress: number
  isUnreachable: boolean
  isLoading: boolean
}

/**
 * Build upgrade items from cluster data and version state.
 */
export function buildUpgradeItems(
  filteredClusters: Cluster[],
  clusterVersions: Record<string, string>,
  agentConnected: boolean,
  fetchCompleted: boolean,
  latestMinor: number,
  getRecommendedUpgrade: (currentVersion: string, latestMinor: number) => string | null,
): UpgradeItem[] {
  return filteredClusters.map((c) => {
    // A cluster is reachable if it has nodes (same logic as other components)
    const hasNodes = c.nodeCount && c.nodeCount > 0
    const isUnreachable = c.reachable === false || (!hasNodes && c.healthy === false)
    const isStillLoading = !hasNodes && c.nodeCount === undefined && c.reachable === undefined

    // Try state first, then fresh cache, then stale cache (survives page refresh), then fallback
    const stateVersion = clusterVersions[c.name]
    const freshCached = getCachedVersion(c.name)
    const staleCached = getStaleCachedVersion(c.name)
    const currentVersion = stateVersion || freshCached || staleCached ||
      (isUnreachable ? '-' : (isStillLoading || (!fetchCompleted && agentConnected) ? 'loading...' : '-'))

    const targetVersion = getRecommendedUpgrade(currentVersion, latestMinor)
    const hasUpgrade = targetVersion && targetVersion !== currentVersion && currentVersion !== '-' && currentVersion !== 'loading...'

    return {
      name: c.name,
      currentVersion,
      targetVersion: hasUpgrade ? targetVersion : currentVersion,
      status: isUnreachable ? 'unreachable' as const :
              isStillLoading ? 'loading' as const :
              hasUpgrade ? 'available' as const : 'current' as const,
      progress: 0,
      isUnreachable,
      isLoading: isStillLoading }
  })
}
