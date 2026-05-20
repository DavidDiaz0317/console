import type { TFunction } from 'i18next'
import { Clock, Eye, Lock, Shield, Users } from 'lucide-react'
import type { SecurityIssue as CachedSecurityIssue } from '../../hooks/useMCP'
import type { ComplianceCheck, RBACBinding, SecurityIssue } from '../../mocks/securityData'
import { AMBER_500, BLUE_500, GREEN_500, PURPLE_500, RED_500 } from '../../lib/theme/chartColors'
import type { SecurityStats } from './securityTypes'

export function transformCachedSecurityIssues(cachedSecurityIssues: CachedSecurityIssue[]): SecurityIssue[] {
  return cachedSecurityIssues.map(issue => {
    let type: SecurityIssue['type'] = 'noSecurityContext'
    const issueLower = (issue.issue || '').toLowerCase()

    if (issueLower.includes('privileged')) type = 'privileged'
    else if (issueLower.includes('root')) type = 'root'
    else if (issueLower.includes('host network')) type = 'hostNetwork'
    else if (issueLower.includes('host pid') || issueLower.includes('hostpid')) type = 'hostPID'
    else if (issueLower.includes('security context') || issueLower.includes('capabilities')) type = 'noSecurityContext'

    return {
      type,
      severity: issue.severity,
      resource: issue.name,
      namespace: issue.namespace,
      cluster: issue.cluster || 'unknown',
      message: issue.details || issue.issue,
    }
  })
}

export function buildSecurityStats(
  globalFilteredIssues: SecurityIssue[],
  filteredRBAC: RBACBinding[],
  filteredCompliance: ComplianceCheck[]
): SecurityStats {
  const high = globalFilteredIssues.filter(i => i.severity === 'high').length
  const medium = globalFilteredIssues.filter(i => i.severity === 'medium').length
  const low = globalFilteredIssues.filter(i => i.severity === 'low').length

  const typeCounts = globalFilteredIssues.reduce((acc, issue) => {
    acc[issue.type] = (acc[issue.type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const clusterCounts = globalFilteredIssues.reduce((acc, issue) => {
    acc[issue.cluster] = (acc[issue.cluster] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const rbacHighRisk = filteredRBAC.filter(r => r.riskLevel === 'high').length
  const rbacMedRisk = filteredRBAC.filter(r => r.riskLevel === 'medium').length
  const rbacLowRisk = filteredRBAC.filter(r => r.riskLevel === 'low').length

  const compliancePass = filteredCompliance.filter(c => c.status === 'pass').length
  const complianceFail = filteredCompliance.filter(c => c.status === 'fail').length
  const complianceWarn = filteredCompliance.filter(c => c.status === 'warn').length
  const complianceScore = filteredCompliance.length > 0
    ? Math.round((compliancePass / filteredCompliance.length) * 100)
    : 100

  return {
    total: globalFilteredIssues.length,
    high,
    medium,
    low,
    typeCounts,
    clusterCounts,
    rbacTotal: filteredRBAC.length,
    rbacHighRisk,
    rbacMedRisk,
    rbacLowRisk,
    complianceTotal: filteredCompliance.length,
    compliancePass,
    complianceFail,
    complianceWarn,
    complianceScore,
    severityChartData: [
      { name: 'High', value: high, color: RED_500 },
      { name: 'Medium', value: medium, color: AMBER_500 },
      { name: 'Low', value: low, color: BLUE_500 },
    ].filter(d => d.value > 0),
    typeChartData: Object.entries(typeCounts).map(([name, value], i) => ({
      name: name.replace(/([A-Z])/g, ' $1').trim(),
      value,
      color: [RED_500, AMBER_500, BLUE_500, GREEN_500, PURPLE_500][i % 5],
    })),
    rbacChartData: [
      { name: 'High Risk', value: rbacHighRisk, color: RED_500 },
      { name: 'Medium Risk', value: rbacMedRisk, color: AMBER_500 },
      { name: 'Low Risk', value: rbacLowRisk, color: GREEN_500 },
    ].filter(d => d.value > 0),
    complianceChartData: [
      { name: 'Pass', value: compliancePass, color: GREEN_500 },
      { name: 'Warn', value: complianceWarn, color: AMBER_500 },
      { name: 'Fail', value: complianceFail, color: RED_500 },
    ].filter(d => d.value > 0),
  }
}

export function groupComplianceByCategory(filteredCompliance: ComplianceCheck[]): Record<string, ComplianceCheck[]> {
  return filteredCompliance.reduce((acc, check) => {
    if (!acc[check.category]) acc[check.category] = []
    acc[check.category].push(check)
    return acc
  }, {} as Record<string, ComplianceCheck[]>)
}

export function getSeverityColorClass(severity: string): string {
  switch (severity) {
    case 'high':
      return 'text-red-400 bg-red-500/20'
    case 'medium':
      return 'text-yellow-400 bg-yellow-500/20'
    case 'low':
      return 'text-blue-400 bg-blue-500/20'
    default:
      return 'text-muted-foreground bg-card'
  }
}

export function getSecurityIssueTypeLabel(t: TFunction, type: string): string {
  const labels: Record<string, string> = {
    privileged: t('cards:security.privilegedContainers'),
    root: t('cards:security.runAsRoot'),
    hostNetwork: t('cards:security.hostNetwork'),
    hostPID: t('cards:security.hostPID'),
    noSecurityContext: t('cards:security.noSecurityContext'),
  }

  return labels[type] || type
}

export function SecurityIssueTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'privileged':
      return (
        <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    case 'root':
      return (
        <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    default:
      return (
        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
  }
}

export function ComplianceCategoryIcon({ category }: { category: string }) {
  if (category === 'Pod Security') return <Shield className="w-5 h-5 text-purple-400" />
  if (category === 'Network') return <Eye className="w-5 h-5 text-blue-400" />
  if (category === 'RBAC') return <Users className="w-5 h-5 text-orange-400" />
  if (category === 'Secrets') return <Lock className="w-5 h-5 text-green-400" />
  if (category === 'Images') return <Clock className="w-5 h-5 text-cyan-400" />
  return null
}
