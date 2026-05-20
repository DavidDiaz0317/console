import type { SecurityTabContentProps } from './securityTypes'
import { SecurityComplianceTab } from './SecurityComplianceTab'
import { SecurityIssuesTab } from './SecurityIssuesTab'
import { SecurityLoadingSkeleton } from './SecurityLoadingSkeleton'
import { SecurityOverviewTab } from './SecurityOverviewTab'
import { SecurityRBACTab } from './SecurityRBACTab'

export function SecurityTabContent({
  activeTab,
  forceSkeletonForOffline,
  stats,
  globalFilteredIssues,
  filteredIssues,
  filteredRBAC,
  complianceByCategory,
  severityFilter,
  selectedIssueType,
  onTabChange,
  onSeverityFilterChange,
  onIssueTypeChange,
}: SecurityTabContentProps) {
  if (forceSkeletonForOffline) {
    return <SecurityLoadingSkeleton />
  }

  if (activeTab === 'overview') {
    return (
      <SecurityOverviewTab
        stats={stats}
        globalFilteredIssues={globalFilteredIssues}
        filteredRBAC={filteredRBAC}
        onTabChange={onTabChange}
        onSeverityFilterChange={onSeverityFilterChange}
      />
    )
  }

  if (activeTab === 'issues') {
    return (
      <SecurityIssuesTab
        stats={stats}
        severityFilter={severityFilter}
        selectedIssueType={selectedIssueType}
        filteredIssues={filteredIssues}
        onSeverityFilterChange={onSeverityFilterChange}
        onIssueTypeChange={onIssueTypeChange}
      />
    )
  }

  if (activeTab === 'rbac') {
    return <SecurityRBACTab stats={stats} filteredRBAC={filteredRBAC} />
  }

  return (
    <SecurityComplianceTab
      stats={stats}
      complianceByCategory={complianceByCategory}
    />
  )
}
