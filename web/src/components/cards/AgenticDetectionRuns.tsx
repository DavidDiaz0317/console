import { useMemo } from 'react'
import { AlertTriangle, CheckCircle, XCircle, AlertCircle, ExternalLink } from 'lucide-react'
import { useAgenticDetectionRuns, type DetectionRun } from '../../hooks/useAgenticDetectionRuns'
import { useCardData } from '../../lib/cards/cardHooks'
import { CardSearchInput } from '../../lib/cards/CardComponents'
import { CardControls } from '../ui/CardControls'
import { Pagination } from '../ui/Pagination'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'

const ITEMS_PER_PAGE = 10

interface AgenticDetectionRunsProps {
  config?: Record<string, unknown>
}

type SortByOption = 'conclusion' | 'reason' | 'commentedAt'

const SORT_OPTIONS = [
  { value: 'commentedAt' as const, label: 'Recent' },
  { value: 'conclusion' as const, label: 'Conclusion' },
  { value: 'reason' as const, label: 'Reason' },
]

const CONCLUSION_ORDER: Record<string, number> = {
  failure: 0,
  warning: 1,
  success: 2,
}

function getConclusionIcon(conclusion: string) {
  switch (conclusion) {
    case 'success':
      return <CheckCircle className="h-4 w-4 text-green-400" />
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-400" />
    case 'failure':
      return <XCircle className="h-4 w-4 text-red-400" />
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />
  }
}

function getConclusionColor(conclusion: string): string {
  switch (conclusion) {
    case 'success':
      return 'text-green-400'
    case 'warning':
      return 'text-yellow-400'
    case 'failure':
      return 'text-red-400'
    default:
      return 'text-muted-foreground'
  }
}

function formatReason(reason: string): string {
  return reason
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

function formatTimeAgo(date: string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export function AgenticDetectionRuns({ config: _config }: AgenticDetectionRunsProps) {
  const { t } = useTranslation(['cards', 'common'])
  const {
    runs,
    issueUrl,
    totalCount,
    isLoading,
    isRefreshing,
    isDemoData,
    isFailed,
    consecutiveFailures,
  } = useAgenticDetectionRuns()

  useCardLoadingState({
    isLoading,
    isRefreshing,
    isDemoData,
    hasAnyData: (runs || []).length > 0,
    isFailed,
    consecutiveFailures,
  })

  const sortComparators: Record<SortByOption, (a: DetectionRun, b: DetectionRun) => number> = {
    commentedAt: (a, b) => new Date(b.commentedAt).getTime() - new Date(a.commentedAt).getTime(),
    conclusion: (a, b) => {
      const orderA = CONCLUSION_ORDER[a.conclusion] ?? 999
      const orderB = CONCLUSION_ORDER[b.conclusion] ?? 999
      return orderA - orderB
    },
    reason: (a, b) => a.reason.localeCompare(b.reason),
  }

  const {
    filteredData,
    currentPageData,
    currentPage,
    setCurrentPage,
    totalPages,
    searchTerm,
    setSearchTerm,
    sortBy,
    setSortBy,
  } = useCardData<DetectionRun, SortByOption>({
    data: runs || [],
    comparators: sortComparators,
    defaultSort: 'commentedAt',
    searchFields: ['conclusion', 'reason'],
    itemsPerPage: ITEMS_PER_PAGE,
  })

  const isEmpty = (runs || []).length === 0

  if (isEmpty && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <CheckCircle className="h-12 w-12 text-green-400 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">
          {t('cards:agenticDetectionRuns.noDetections')}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {t('cards:agenticDetectionRuns.noDetectionsDesc')}
        </p>
        {issueUrl && (
          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            {t('cards:agenticDetectionRuns.viewIssue')}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <CardControls
        searchSlot={
          <CardSearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder={t('cards:agenticDetectionRuns.searchPlaceholder')}
          />
        }
        sortSlot={
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortByOption)}
            className="px-3 py-1.5 text-sm bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="space-y-2">
          {(currentPageData || []).map((run, idx) => (
            <div
              key={`${run.runId}-${idx}`}
              className="p-3 rounded-md border border-border hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="mt-0.5">{getConclusionIcon(run.conclusion)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('font-medium text-sm', getConclusionColor(run.conclusion))}>
                        {run.conclusion.toUpperCase()}
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-sm text-muted-foreground">{formatReason(run.reason)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatTimeAgo(run.commentedAt)}</div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {run.workflowUrl && (
                    <a
                      href={run.workflowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {t('cards:agenticDetectionRuns.viewRun')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      )}

      {issueUrl && (
        <div className="mt-3 pt-3 border-t border-border">
          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1.5"
          >
            {t('cards:agenticDetectionRuns.viewAllIssue')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  )
}
