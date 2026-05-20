import type { ComplianceCheck, RBACBinding, SecurityIssue } from '../../mocks/securityData'

export type ViewTab = 'overview' | 'issues' | 'rbac' | 'compliance'
export type SecuritySeverityFilter = 'all' | SecurityIssue['severity']

export interface SecurityChartDatum {
  name: string
  value: number
  color: string
}

export interface SecurityStats {
  total: number
  high: number
  medium: number
  low: number
  typeCounts: Record<string, number>
  clusterCounts: Record<string, number>
  rbacTotal: number
  rbacHighRisk: number
  rbacMedRisk: number
  rbacLowRisk: number
  complianceTotal: number
  compliancePass: number
  complianceFail: number
  complianceWarn: number
  complianceScore: number
  severityChartData: SecurityChartDatum[]
  typeChartData: SecurityChartDatum[]
  rbacChartData: SecurityChartDatum[]
  complianceChartData: SecurityChartDatum[]
}

export interface SecurityTabContentProps {
  activeTab: ViewTab
  forceSkeletonForOffline: boolean
  stats: SecurityStats
  globalFilteredIssues: SecurityIssue[]
  filteredIssues: SecurityIssue[]
  filteredRBAC: RBACBinding[]
  complianceByCategory: Record<string, ComplianceCheck[]>
  severityFilter: SecuritySeverityFilter
  selectedIssueType: string | null
  onTabChange: (tab: ViewTab) => void
  onSeverityFilterChange: (filter: SecuritySeverityFilter) => void
  onIssueTypeChange: (issueType: string | null) => void
}
