import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import type { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { useDemoMode } from '../../hooks/useDemoMode'
import { RotatingTip } from '../ui/RotatingTip'
import { useLocalAgent, wasAgentEverConnected } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { getDefaultCards } from '../../config/dashboards'
import { ensureCardInDashboard } from '../../lib/dashboards/migrateStorageKey'
import { SecurityTabContent } from './SecurityTabContent'
import { SecurityTabsSection } from './SecurityTabsSection'
import type { SecuritySeverityFilter, ViewTab } from './securityTypes'
import { useSecurityData } from './useSecurityData'

const SECURITY_CARDS_KEY = 'kubestellar-security-cards'

ensureCardInDashboard(SECURITY_CARDS_KEY, 'iso27001_audit', {
  id: 'security-0',
  card_type: 'iso27001_audit',
  position: { w: 6, h: 3, x: 0, y: 0 },
})

const DEFAULT_SECURITY_CARDS = getDefaultCards('security')

export function Security() {
  const { t } = useTranslation(['cards', 'common'])
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    filterBySeverity,
    customFilter,
  } = useGlobalFilters()

  const [severityFilter, setSeverityFilter] = useState<SecuritySeverityFilter>('all')
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const [selectedIssueType, setSelectedIssueType] = useState<string | null>(null)

  const { isDemoMode } = useDemoMode()
  const { status: agentStatus } = useLocalAgent()
  const isModeSwitching = useIsModeSwitching()

  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline =
    ((!isDemoMode && isAgentOffline && !isInClusterMode() && !wasAgentEverConnected()) || isModeSwitching)

  const {
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
  } = useSecurityData({
    isDemoMode,
    globalSelectedClusters,
    isAllClustersSelected,
    filterBySeverity,
    customFilter,
    severityFilter,
  })

  useEffect(() => {
    if (location.pathname !== '/security') return
    if (searchParams.get('addCard') === 'true') {
      setSearchParams({}, { replace: true })
    }
  }, [location.pathname, searchParams, setSearchParams])

  useEffect(() => {
    handleRefresh()
  }, [handleRefresh])

  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    const hasDataToShow = stats.total > 0

    switch (blockId) {
      case 'issues':
        return {
          value: stats.total,
          sublabel: 'total issues',
          onClick: () => setActiveTab('issues'),
          isClickable: hasDataToShow,
        }
      case 'critical':
        return {
          value: stats.high,
          sublabel: 'critical issues',
          onClick: () => {
            setSeverityFilter('high')
            setActiveTab('issues')
          },
          isClickable: stats.high > 0,
        }
      case 'high':
        return {
          value: stats.high,
          sublabel: 'high severity',
          onClick: () => {
            setSeverityFilter('high')
            setActiveTab('issues')
          },
          isClickable: stats.high > 0,
        }
      case 'medium':
        return {
          value: stats.medium,
          sublabel: 'medium severity',
          onClick: () => {
            setSeverityFilter('medium')
            setActiveTab('issues')
          },
          isClickable: stats.medium > 0,
        }
      case 'low':
        return {
          value: stats.low,
          sublabel: 'low severity',
          onClick: () => {
            setSeverityFilter('low')
            setActiveTab('issues')
          },
          isClickable: stats.low > 0,
        }
      case 'privileged':
        return {
          value: stats.typeCounts.privileged || 0,
          sublabel: 'privileged containers',
        }
      case 'root':
        return {
          value: stats.typeCounts.root || 0,
          sublabel: 'running as root',
        }
      default:
        return { value: 0 }
    }
  }

  return (
    <DashboardPage
      title={t('common:navigation.security')}
      subtitle={t('cards:security.subtitle')}
      icon="Shield"
      rightExtra={<RotatingTip page="security" />}
      storageKey={SECURITY_CARDS_KEY}
      defaultCards={DEFAULT_SECURITY_CARDS}
      statsType="security"
      getStatValue={getDashboardStatValue}
      onRefresh={handleRefresh}
      isLoading={false}
      isRefreshing={securityLoading || dataRefreshing || securityRefreshing}
      lastUpdated={lastUpdated}
      hasData={stats.total > 0 || securityIssues.length > 0}
      beforeCards={
        <SecurityTabsSection
          activeTab={activeTab}
          stats={stats}
          refreshError={refreshError}
          onRetry={handleRefresh}
          onTabChange={setActiveTab}
        >
          <SecurityTabContent
            activeTab={activeTab}
            forceSkeletonForOffline={forceSkeletonForOffline}
            stats={stats}
            globalFilteredIssues={globalFilteredIssues}
            filteredIssues={filteredIssues}
            filteredRBAC={filteredRBAC}
            complianceByCategory={complianceByCategory}
            severityFilter={severityFilter}
            selectedIssueType={selectedIssueType}
            onTabChange={setActiveTab}
            onSeverityFilterChange={setSeverityFilter}
            onIssueTypeChange={setSelectedIssueType}
          />
        </SecurityTabsSection>
      }
      emptyState={{
        title: t('cards:security.securityDashboard'),
        description: t('cards:security.emptyDescription'),
      }}
    />
  )
}
