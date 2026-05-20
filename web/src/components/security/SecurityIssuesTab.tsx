import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterBadge } from '../ui/ClusterBadge'
import { cn } from '../../lib/cn'
import type { SecurityIssue } from '../../mocks/securityData'
import type { SecuritySeverityFilter, SecurityStats } from './securityTypes'
import {
  getSecurityIssueTypeLabel,
  getSeverityColorClass,
  SecurityIssueTypeIcon,
} from './securityUtils'

interface SecurityIssuesTabProps {
  stats: SecurityStats
  severityFilter: SecuritySeverityFilter
  selectedIssueType: string | null
  filteredIssues: SecurityIssue[]
  onSeverityFilterChange: (filter: SecuritySeverityFilter) => void
  onIssueTypeChange: (issueType: string | null) => void
}

export function SecurityIssuesTab({
  stats,
  severityFilter,
  selectedIssueType,
  filteredIssues,
  onSeverityFilterChange,
  onIssueTypeChange,
}: SecurityIssuesTabProps) {
  const { t } = useTranslation(['cards', 'common'])
  const visibleIssues = filteredIssues.filter(
    issue => selectedIssueType === null || issue.type === selectedIssueType
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[
          { sev: 'all' as const, label: t('cards:security.allIssues'), count: stats.total, color: 'text-foreground', bg: 'bg-card' },
          { sev: 'high' as const, label: t('cards:security.highLabel'), count: stats.high, color: 'text-red-400', bg: 'bg-red-500/20' },
          { sev: 'medium' as const, label: t('cards:security.mediumLabel'), count: stats.medium, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
          { sev: 'low' as const, label: t('cards:security.lowLabel'), count: stats.low, color: 'text-blue-400', bg: 'bg-blue-500/20' },
        ].map(item => (
          <button
            key={item.sev}
            onClick={() => onSeverityFilterChange(item.sev)}
            className={cn(
              'glass p-4 rounded-lg text-left transition-all',
              severityFilter === item.sev ? 'ring-2 ring-purple-500' : 'hover:bg-secondary/30'
            )}
          >
            <div className="text-2xl font-bold" style={{ color: item.color === 'text-foreground' ? undefined : item.color.replace('text-', '') }}>
              <span className={item.color}>{item.count}</span>
            </div>
            <div className="text-xs text-muted-foreground">{item.label}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground mr-2">{t('cards:security.filterByType')}</span>
        <button
          onClick={() => onIssueTypeChange(null)}
          className={cn(
            'px-3 py-1 rounded-full text-xs font-medium transition-colors',
            selectedIssueType === null ? 'bg-purple-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground'
          )}
        >
          {t('common:common.all')}
        </button>
        {Object.entries(stats.typeCounts).map(([type, count]) => (
          <button
            key={type}
            onClick={() => onIssueTypeChange(selectedIssueType === type ? null : type)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1',
              selectedIssueType === type ? 'bg-purple-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            {getSecurityIssueTypeLabel(t, type)} <span className="opacity-60">({count})</span>
          </button>
        ))}
      </div>

      {visibleIssues.length === 0 ? (
        <div className="text-center py-12">
          <ShieldCheck className="w-16 h-16 mx-auto mb-4 text-green-400 opacity-50" />
          <p className="text-lg text-foreground">{t('cards:security.noIssuesFound')}</p>
          <p className="text-sm text-muted-foreground">{t('cards:security.bestPractices')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleIssues.map((issue, i) => (
            <div
              key={i}
              className={cn(
                'glass p-4 rounded-lg border-l-4',
                issue.severity === 'high'
                  ? 'border-l-red-500'
                  : issue.severity === 'medium'
                    ? 'border-l-yellow-500'
                    : 'border-l-blue-500'
              )}
            >
              <div className="flex items-start gap-4">
                <div className="mt-1">
                  <SecurityIssueTypeIcon type={issue.type} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <ClusterBadge cluster={issue.cluster} size="sm" />
                    <span className="font-semibold text-foreground">{issue.resource}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${getSeverityColorClass(issue.severity)}`}>
                      {issue.severity}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-card text-muted-foreground">
                      {getSecurityIssueTypeLabel(t, issue.type)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{issue.message}</p>
                  <div className="text-xs text-muted-foreground mt-2">
                    {t('common:common.namespace')}: {issue.namespace}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
