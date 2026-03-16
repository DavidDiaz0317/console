import { useDroppable } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, Plus, Check, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Dashboard } from '../../hooks/useDashboards'
import { useDashboardHealth } from '../../hooks/useDashboardHealth'

interface DashboardDropZoneProps {
  dashboards: Dashboard[]
  currentDashboardId: string | undefined
  isDragging: boolean
  onCreateDashboard?: () => void
}

export function DashboardDropZone({
  dashboards,
  currentDashboardId,
  isDragging,
  onCreateDashboard,
}: DashboardDropZoneProps) {
  const { t } = useTranslation()
  const health = useDashboardHealth()
  // Filter out current dashboard (handle null/undefined dashboards)
  const otherDashboards = (dashboards || []).filter((d) => d.id !== currentDashboardId)

  if (!isDragging) return null

  const HealthIcon = health.status === 'critical' ? AlertCircle : health.status === 'warning' ? AlertTriangle : CheckCircle
  const healthColor = health.status === 'critical' ? 'text-red-400' : health.status === 'warning' ? 'text-yellow-400' : 'text-green-400'

  return (
    <div className="fixed right-6 top-24 z-50 animate-fade-in-up">
      <div className="glass rounded-xl border border-border/50 p-4 w-64 shadow-2xl">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
          <LayoutDashboard className="w-4 h-4 text-purple-400" />
          {t('dashboard.dropZone.moveToDashboard')}
        </div>

        {/* Health status indicator */}
        <div className={cn('flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-lg text-xs border', {
          'bg-red-500/10 border-red-500/20': health.status === 'critical',
          'bg-yellow-500/10 border-yellow-500/20': health.status === 'warning',
          'bg-green-500/10 border-green-500/20': health.status === 'healthy',
        })}>
          <HealthIcon className={cn('w-3 h-3 shrink-0', healthColor)} />
          <span className={healthColor}>{health.message}</span>
        </div>

        {otherDashboards.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">
              {t('dashboard.dropZone.noOtherDashboards')}
            </p>
            {onCreateDashboard && (
              <button
                onClick={onCreateDashboard}
                className="flex items-center gap-2 mx-auto px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 text-sm"
              >
                <Plus className="w-4 h-4" />
                {t('dashboard.dropZone.createNewDashboard')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {otherDashboards.map((dashboard) => (
              <DroppableDashboard
                key={dashboard.id}
                dashboard={dashboard}
              />
            ))}

            {onCreateDashboard && (
              <button
                onClick={onCreateDashboard}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-dashed border-border/50 text-muted-foreground hover:text-foreground hover:border-purple-500/50 text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('dashboard.dropZone.createNewDashboard')}
              </button>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-3 text-center">
          {t('dashboard.dropZone.dropCardHere')}
        </p>
      </div>
    </div>
  )
}

interface DroppableDashboardProps {
  dashboard: Dashboard
}

function DroppableDashboard({ dashboard }: DroppableDashboardProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `dashboard-drop-${dashboard.id}`,
    data: {
      type: 'dashboard',
      dashboardId: dashboard.id,
      dashboardName: dashboard.name,
    },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-3 px-3 py-3 rounded-lg border transition-all cursor-pointer',
        isOver
          ? 'bg-purple-500/20 border-purple-500 text-foreground scale-105'
          : 'bg-secondary/30 border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
      )}
    >
      <LayoutDashboard className={cn('w-4 h-4', isOver && 'text-purple-400')} />
      <span className="flex-1 text-sm truncate">{dashboard.name}</span>
      {isOver && <Check className="w-4 h-4 text-green-400" />}
    </div>
  )
}
