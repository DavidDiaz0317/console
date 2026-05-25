/**
 * Hook to fetch in-toto supply chain security data from connected clusters.
 *
 * Uses parallel cluster checks with progressive streaming:
 * - Phase 1: CRD existence check per cluster (8s timeout)
 * - Phase 2: Fetch layouts and link metadata from installed clusters (30s timeout)
 * - Clusters checked with bounded concurrency (default 8 parallel)
 * - Results stream to the card as each cluster completes
 * - localStorage cache with auto-refresh
 * - Demo fallback when no clusters are connected
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useClusters } from './useMCP'
import { DEFAULT_REFRESH_INTERVAL_MS as REFRESH_INTERVAL_MS } from '../lib/constants'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import { useDemoMode } from './useDemoMode'
import { registerRefetch, registerCacheReset, unregisterCacheReset } from '../lib/modeTransition'
import {
  IntotoClusterStatus,
  getDemoStatus,
} from './useIntotoTransform'
import {
  loadFromCache,
  saveToCache,
  clearCache,
  fetchSingleCluster,
} from './useIntotoFetch'

// Re-export types for backward compatibility
export type {
  IntotoStep,
  IntotoLayout,
  IntotoClusterStatus,
  IntotoStats,
} from './useIntotoTransform'
export { computeIntotoStats } from './useIntotoTransform'

const INTOTO_CACHE_MAX_AGE_MS = REFRESH_INTERVAL_MS

// ── Hook ─────────────────────────────────────────────────────────────────

export function useIntoto() {
  const { isDemoMode } = useDemoMode()
  // (#11156) deduplicateClustersByServer now sorts reachable contexts first and uses the primary's reachable
  // flag authoritatively, so deduplicatedClusters is safe to use for kubectl-based operations.
  const { deduplicatedClusters: allClusters, isLoading: clustersLoading } = useClusters()

  // Snapshot ref value to avoid reading ref during render
  const cachedData = useRef(loadFromCache())
  const cachedSnapshot = cachedData.current
  const [statuses, setStatuses] = useState<Record<string, IntotoClusterStatus>>(
    cachedSnapshot?.statuses || {}
  )
  const [isLoading, setIsLoading] = useState(!cachedSnapshot)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(
    cachedSnapshot?.timestamp ? new Date(cachedSnapshot.timestamp) : null
  )
  /** Number of clusters that have completed checking (for progressive UI) */
  const [clustersChecked, setClustersChecked] = useState(0)
  /**
   * Number of consecutive fetch cycles where every cluster returned an error
   * (connection failed — not merely "not installed", which is a valid state).
   * Reset to 0 on any cycle where at least one cluster responds cleanly.
   */
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const initialLoadDone = useRef(!!cachedSnapshot)
  /** Guard to prevent concurrent refetch calls from flooding the request queue */
  const fetchInProgress = useRef(false)

  const clusters = allClusters.filter(c => c.reachable === true).map(c => c.name)
  // Stable identity for cluster list — prevents stale closures when clusters
  // swap but count stays the same (#15366)
  const clustersKey = useMemo(() => [...clusters].sort().join(','), [clusters])

  const refetch = useCallback(async (silent = false) => {
    if (clusters.length === 0) {
      setIsLoading(false)
      return
    }

    // Skip if a fetch is already in progress to prevent queue flooding
    if (fetchInProgress.current) return
    fetchInProgress.current = true

    try {
      if (!silent) {
        setIsRefreshing(true)
        if (!initialLoadDone.current) setIsLoading(true)
      }
      setClustersChecked(0)

      // Check all clusters with bounded concurrency, stream results progressively
      const clusterList = clusters || []

      const tasks = clusterList.map(cluster => async () => {
        const status = await fetchSingleCluster(cluster)
        // Stream each result immediately — card re-renders progressively
        setStatuses(prev => ({ ...prev, [cluster]: status }))
        setClustersChecked(prev => prev + 1)
        // Clear loading state once first cluster with data arrives
        if (!initialLoadDone.current && status.installed) {
          initialLoadDone.current = true
          setIsLoading(false)
        }
        return { cluster, status }
      })

      const settled = await settledWithConcurrency(tasks)

      // Collect results from settled promises — no shared mutable state
      const allStatuses: Record<string, IntotoClusterStatus> = {}
      for (const result of (settled || [])) {
        if (result.status === 'fulfilled' && result.value) {
          const { cluster, status } = result.value as { cluster: string; status: IntotoClusterStatus }
          allStatuses[cluster] = status
        }
      }

      // A cycle "fails" only when every cluster returned a connection error —
      // "not installed" is a clean result and should reset the counter.
      const anyCleanResult = Object.values(allStatuses).some(s => !s.error)
      if (anyCleanResult) {
        setConsecutiveFailures(0)
      } else {
        setConsecutiveFailures(prev => prev + 1)
      }

      // Final: save complete cache and clear refresh state
      saveToCache(allStatuses)
      setLastRefresh(new Date())
      initialLoadDone.current = true
      setIsLoading(false)
      setIsRefreshing(false)
    } finally {
      fetchInProgress.current = false
    }
  }, [clusters])

  // Demo mode
  useEffect(() => {
    if (isDemoMode) {
      const demoNames = clusters.length > 0
        ? clusters
        : ['us-east-1', 'eu-central-1', 'us-west-2']
      const demoStatuses: Record<string, IntotoClusterStatus> = {}
      for (const name of (demoNames || [])) {
        demoStatuses[name] = getDemoStatus(name)
      }
      setStatuses(demoStatuses)
      setClustersChecked(demoNames.length)
      setIsLoading(false)
      setLastRefresh(new Date())
      initialLoadDone.current = true
      return
    }

    if (clusters.length > 0) {
      refetch()
    } else if (!clustersLoading) {
      // Only clear loading when cluster list has actually been fetched
      // (prevents premature empty state while useClusters is still resolving)
      setIsLoading(false)
    }
  }, [clusters.length, isDemoMode, clustersLoading, clustersKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Register with unified mode transition system so skeleton/refetch works
  // in sync with all other cards when demo mode is toggled
  useEffect(() => {
    registerCacheReset('intoto', () => {
      clearCache()
      setStatuses({})
      setIsLoading(true)
      setLastRefresh(null)
      setClustersChecked(0)
      setConsecutiveFailures(0)
      initialLoadDone.current = false
    })

    const unregisterRefetch = registerRefetch('intoto', () => {
      refetch(false)
    })

    return () => {
      unregisterCacheReset('intoto')
      unregisterRefetch()
    }
  }, [refetch])

  // Auto-refresh — always poll when clusters exist so we detect tools
  // that get installed later or clusters that become reachable
  useEffect(() => {
    if (isDemoMode || clusters.length === 0) return
    const interval = setInterval(() => refetch(true), INTOTO_CACHE_MAX_AGE_MS)
    return () => clearInterval(interval)
  }, [clusters.length, refetch, isDemoMode, clustersKey])

  const isDemoData = isDemoMode
  const installed = Object.values(statuses).some(s => s.installed)

  /** True when at least one cluster had a fetch error (distinct from "not installed") */
  const hasErrors = Object.values(statuses).some(s => !!s.error)

  /** Three or more consecutive all-error cycles → card is in failed state */
  const FAILURE_THRESHOLD = 3
  const isFailed = consecutiveFailures >= FAILURE_THRESHOLD

  return {
    statuses,
    isLoading,
    isRefreshing,
    lastRefresh,
    installed,
    /** True when at least one cluster had a fetch error */
    hasErrors,
    isDemoData,
    /** True when 3+ consecutive fetch cycles all produced only connection errors */
    isFailed,
    /** Number of consecutive all-error fetch cycles */
    consecutiveFailures,
    /** Number of clusters checked so far (for progressive UI) */
    clustersChecked,
    /** Total number of clusters being checked */
    totalClusters: clusters.length,
    refetch,
  }
}
