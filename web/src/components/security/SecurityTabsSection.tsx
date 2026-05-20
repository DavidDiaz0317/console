import type { ReactNode } from 'react'
import { AlertTriangle, Shield, ShieldAlert, ShieldCheck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { SecurityStats, ViewTab } from './securityTypes'

interface SecurityTabsSectionProps {
  activeTab: ViewTab
  stats: SecurityStats
  refreshError: string | null
  onRetry: () => void
  onTabChange: (tab: ViewTab) => void
  children: ReactNode
}

export function SecurityTabsSection({
  activeTab,
  stats,
  refreshError,
  onRetry,
  onTabChange,
  children,
}: SecurityTabsSectionProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <>
      {refreshError && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{t('cards:security.refreshFailed')}</p>
            <p className="text-sm text-red-300/80">{refreshError}</p>
          </div>
          <button
            onClick={onRetry}
            className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium transition-colors"
          >
            {t('common:common.retry')}
          </button>
        </div>
      )}

      <div className="flex gap-1 mb-6 border-b border-border">
        {[
          { id: 'overview' as const, label: t('cards:security.overview'), icon: Shield },
          { id: 'issues' as const, label: t('cards:security.issues'), icon: ShieldAlert, count: stats.total },
          { id: 'rbac' as const, label: t('cards:security.rbac'), icon: Users, count: stats.rbacTotal },
          { id: 'compliance' as const, label: t('cards:security.compliance'), icon: ShieldCheck },
        ].map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 mb-[-2px] transition-colors',
                activeTab === tab.id
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 text-xs rounded-full',
                    tab.id === 'issues' && stats.high > 0 ? 'bg-red-500/20 text-red-400' : 'bg-card text-muted-foreground'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mb-6">{children}</div>
    </>
  )
}
