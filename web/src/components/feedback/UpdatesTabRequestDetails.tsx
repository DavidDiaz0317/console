import { useTranslation } from 'react-i18next'
import { Check, ExternalLink, GitPullRequest } from 'lucide-react'
import { getStatusDescription } from '../../hooks/useFeatureRequests'
import type { FeatureRequest } from '../../hooks/useFeatureRequests'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import type { RequestStatusInfo } from './UpdatesTab.types'

const REOPEN_COMMENT_ROWS = 3
const REOPEN_COMMENT_MAX_LENGTH = 1000

interface UntriagedRequestContentProps {
  request: FeatureRequest
  isOwnedByUser: boolean
  statusInfo: RequestStatusInfo
}

interface TriagedRequestContentProps {
  request: FeatureRequest
  shouldBlur: boolean
  statusInfo: RequestStatusInfo
  isAwaitingVerification: boolean
}

interface FixCompleteBannerProps {
  request: FeatureRequest
  isAwaitingVerification: boolean
  isVerified: boolean
}

interface FixVerificationPromptProps {
  requestId: string
  canPerformActions: boolean
  isLoading: boolean
  isReopenFormVisible: boolean
  reopenComment: string
  onVerify: () => void
  onToggleReopenForm: () => void
  onReopenCommentChange: (value: string) => void
  onReopenSubmit: () => void
  onShowLoginPrompt: () => void
}

export function UntriagedRequestContent({ request, isOwnedByUser, statusInfo }: UntriagedRequestContentProps) {
  return isOwnedByUser ? (
    <>
      <p className="text-sm font-medium text-foreground mt-1 truncate blur-xs select-none">
        {request.request_type === 'bug' ? '\uD83D\uDC1B ' : '\u2728 '}{request.title}
      </p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${statusInfo.bgColor} ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
        {request.github_issue_url && (
          <a
            href={sanitizeUrl(request.github_issue_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3" />
            View on GitHub
          </a>
        )}
      </div>
      <p className="text-xs text-muted-foreground italic mt-1.5">
        Details will be visible to you once we accept triage
      </p>
    </>
  ) : (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${statusInfo.bgColor} ${statusInfo.color}`}>
        {statusInfo.label}
      </span>
      <span className="text-xs text-muted-foreground italic">Awaiting maintainer attention</span>
      {request.github_issue_number && <span className="text-xs text-muted-foreground">#{request.github_issue_number}</span>}
      {request.github_issue_url && (
        <a
          href={sanitizeUrl(request.github_issue_url)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
          View on GitHub
        </a>
      )}
    </div>
  )
}

export function TriagedRequestContent({ request, shouldBlur, statusInfo, isAwaitingVerification }: TriagedRequestContentProps) {
  const { t } = useTranslation()

  return (
    <>
      <p className={`text-sm font-medium text-foreground mt-1 truncate ${shouldBlur ? 'blur-xs select-none' : ''}`}>
        {request.request_type === 'bug' ? '\uD83D\uDC1B ' : '\u2728 '}{request.title}
      </p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${statusInfo.bgColor} ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
        {request.status === 'fix_complete' && (
          <span className="px-1.5 py-0.5 text-2xs font-medium rounded bg-gray-500/20 text-muted-foreground">
            Closed
          </span>
        )}
        {isAwaitingVerification && (
          <span className="px-1.5 py-0.5 text-2xs font-medium rounded bg-blue-500/20 text-blue-300">
            {t('feedback.awaitingVerificationBadge')}
          </span>
        )}
        {getStatusDescription(request.status, request.closed_by_user) && (
          <span className={`text-xs text-muted-foreground ${shouldBlur ? 'blur-xs select-none' : ''}`}>
            {getStatusDescription(request.status, request.closed_by_user)}
          </span>
        )}
      </div>
    </>
  )
}

export function FixCompleteBanner({ request, isAwaitingVerification, isVerified }: FixCompleteBannerProps) {
  const { t } = useTranslation()

  return (
    <div className="mt-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Check className="w-4 h-4 text-green-400" />
          <span className="text-xs font-semibold text-green-400">{t('feedback.fixMerged')}</span>
        </div>
        {isVerified && (
          <span className="px-1.5 py-0.5 text-2xs font-medium rounded bg-green-500/20 text-green-300">
            {t('feedback.verifiedByYou')}
          </span>
        )}
        {isAwaitingVerification && (
          <span className="px-1.5 py-0.5 text-2xs font-medium rounded bg-blue-500/20 text-blue-300">
            {t('feedback.awaitingVerificationBadge')}
          </span>
        )}
      </div>
      <p className="text-xs text-green-300/80 mb-2">
        {isVerified
          ? t('feedback.verificationRecorded')
          : t('feedback.fixMergedDescription', {
            requestType: request.request_type === 'bug'
              ? t('feedback.requestTypeBugFix')
              : t('feedback.requestTypeFeature'),
          })}
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <a
          href="https://github.com/kubestellar/console/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs flex items-center gap-1 text-green-400 hover:text-green-300"
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
          {t('feedback.releases')}
        </a>
        {request.pr_url && (
          <a
            href={sanitizeUrl(request.pr_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs flex items-center gap-1 text-green-400 hover:text-green-300"
            onClick={(event) => event.stopPropagation()}
          >
            <GitPullRequest className="w-3 h-3" />
            PR #{request.pr_number}
          </a>
        )}
        {request.github_issue_url && (
          <a
            href={sanitizeUrl(request.github_issue_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs flex items-center gap-1 text-green-400 hover:text-green-300"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3" />
            Issue #{request.github_issue_number}
          </a>
        )}
      </div>
    </div>
  )
}

export function FixVerificationPrompt({
  requestId,
  canPerformActions,
  isLoading,
  isReopenFormVisible,
  reopenComment,
  onVerify,
  onToggleReopenForm,
  onReopenCommentChange,
  onReopenSubmit,
  onShowLoginPrompt,
}: FixVerificationPromptProps) {
  const { t } = useTranslation()
  const isCommentEmpty = reopenComment.trim().length === 0

  return (
    <div className="mt-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3" data-testid={`awaiting-verification-${requestId}`}>
      <p className="text-sm font-medium text-blue-200">{t('feedback.awaitingVerificationQuestion')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={canPerformActions ? onVerify : onShowLoginPrompt}
          disabled={canPerformActions && isLoading}
          className="px-2.5 py-1.5 text-xs rounded bg-green-500/20 hover:bg-green-500/30 text-green-300 transition-colors disabled:opacity-50"
        >
          {canPerformActions && isLoading ? t('feedback.verifyingFix') : t('feedback.verifyFix')}
        </button>
        <button
          onClick={canPerformActions ? onToggleReopenForm : onShowLoginPrompt}
          className="px-2.5 py-1.5 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
        >
          {t('feedback.stillBroken')}
        </button>
      </div>
      {isReopenFormVisible && (
        <div className="mt-3 space-y-2">
          <textarea
            value={reopenComment}
            onChange={(event) => onReopenCommentChange(event.target.value.slice(0, REOPEN_COMMENT_MAX_LENGTH))}
            rows={REOPEN_COMMENT_ROWS}
            maxLength={REOPEN_COMMENT_MAX_LENGTH}
            className="w-full rounded-md border border-border bg-background/70 px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400"
            placeholder={t('feedback.stillBrokenPlaceholder')}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onReopenSubmit}
              disabled={isLoading || isCommentEmpty}
              className="px-2.5 py-1.5 text-xs rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 transition-colors disabled:opacity-50"
            >
              {isLoading ? t('feedback.submittingReopen') : t('feedback.submitStillBroken')}
            </button>
            <button
              onClick={onToggleReopenForm}
              className="px-2.5 py-1.5 text-xs rounded bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
            >
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
