import { useCallback, useMemo, useState } from 'react'
import { useCachedSecurityIssues } from '../../hooks/useCachedData'
import {
  getMockComplianceData,
  getMockRBACData,
  getMockSecurityData,
} from '../../mocks/securityData'
import { SHORT_DELAY_MS } from '../../lib/constants/network'
import type { SecuritySeverityFilter } from './securityTypes'
import {
  buildSecurityStats,
  groupComplianceByCategory,
  transformCachedSecurityIssues,
} from './securityUtils'

interface UseSecurityDataOptions {
  isDemoMode: boolean
  globalSelectedClusters: string[]
  isAllClustersSelected: boolean
  filterBySeverity: <T extends { severity?: string }>(items: T[]) => T[]
  customFilter: string
  severityFilter: SecuritySeverityFilter
}

export function useSecurityData({
  isDemoMode,
  globalSelectedClusters,
  isAllClustersSelected,
  filterBySeverity,
  customFilter,
  severityFilter,
}: UseSecurityDataOptions) {
  const [dataRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const {
    issues: cachedSecurityIssues,
    isLoading: securityLoading,
    isRefreshing: securityRefreshing,
  } = useCachedSecurityIssues()

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    setRefreshError(null)
    try {
      await new Promise(resolve => setTimeout(resolve, SHORT_DELAY_MS))
      setLastUpdated(new Date())
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to refresh security data'
      setRefreshError(message)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  const securityIssues = useMemo(
    () => (isDemoMode ? getMockSecurityData() : transformCachedSecurityIssues(cachedSecurityIssues)),
    [cachedSecurityIssues, isDemoMode]
  )

  const rbacBindings = useMemo(() => (isDemoMode ? getMockRBACData() : []), [isDemoMode])
  const complianceChecks = useMemo(() => (isDemoMode ? getMockComplianceData() : []), [isDemoMode])

  const globalFilteredIssues = useMemo(() => {
    let result = securityIssues

    if (!isAllClustersSelected) {
      result = result.filter(issue => globalSelectedClusters.includes(issue.cluster))
    }

    result = filterBySeverity(result)

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(issue =>
        issue.resource.toLowerCase().includes(query) ||
        issue.namespace.toLowerCase().includes(query) ||
        issue.cluster.toLowerCase().includes(query) ||
        issue.message.toLowerCase().includes(query)
      )
    }

    return result
  }, [
    customFilter,
    filterBySeverity,
    globalSelectedClusters,
    isAllClustersSelected,
    securityIssues,
  ])

  const filteredIssues = useMemo(() => {
    let result = globalFilteredIssues
    if (severityFilter !== 'all') {
      result = result.filter(issue => issue.severity === severityFilter)
    }
    return result
  }, [globalFilteredIssues, severityFilter])

  const filteredRBAC = useMemo(() => {
    if (isAllClustersSelected) return rbacBindings
    return rbacBindings.filter(binding => globalSelectedClusters.includes(binding.cluster))
  }, [globalSelectedClusters, isAllClustersSelected, rbacBindings])

  const filteredCompliance = useMemo(() => {
    if (isAllClustersSelected) return complianceChecks
    return complianceChecks.filter(check => globalSelectedClusters.includes(check.cluster))
  }, [complianceChecks, globalSelectedClusters, isAllClustersSelected])

  const stats = useMemo(
    () => buildSecurityStats(globalFilteredIssues, filteredRBAC, filteredCompliance),
    [filteredCompliance, filteredRBAC, globalFilteredIssues]
  )

  const complianceByCategory = useMemo(
    () => groupComplianceByCategory(filteredCompliance),
    [filteredCompliance]
  )

  return {
    securityIssues,
    globalFilteredIssues,
    filteredIssues,
    filteredRBAC,
    complianceByCategory,
    stats,
    handleRefresh,
    dataRefreshing,
    lastUpdated,
    refreshError,
    securityLoading,
    securityRefreshing,
  }
}
