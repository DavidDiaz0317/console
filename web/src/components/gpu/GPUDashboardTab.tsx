import { useTranslation } from 'react-i18next'
import {
  Plus,
  LayoutDashboard,
  CheckCircle,
  AlertTriangle,
  WifiOff,
} from 'lucide-react'
import { SortableGpuCard } from './SortableGpuCard'
import type { GpuDashCard } from './SortableGpuCard'
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import type { SensorDescriptor, SensorOptions } from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable'

/** Optional GPU cluster health summary for the dashboard header */
export interface GPUHealthSummary {
  healthy: number
  degraded: number
  offline: number
}

export interface GPUDashboardTabProps {
  dashboardCards: GpuDashCard[]
  dashCardIds: string[]
  gpuDashSensors: SensorDescriptor<SensorOptions>[]
  gpuLiveMode: boolean
  isRefreshingDashboard: boolean
  onDashDragEnd: (event: DragEndEvent) => void
  onRemoveDashboardCard: (index: number) => void
  onDashCardWidthChange: (index: number, newWidth: number) => void
  onTriggerRefresh: () => void
  onShowAddCardModal: () => void
  /** Optional health summary for GPU cluster nodes */
  healthSummary?: GPUHealthSummary
}

export function GPUDashboardTab({
  dashboardCards,
  dashCardIds,
  gpuDashSensors,
  gpuLiveMode,
  isRefreshingDashboard,
  onDashDragEnd,
  onRemoveDashboardCard,
  onDashCardWidthChange,
  onTriggerRefresh,
  onShowAddCardModal,
  healthSummary,
}: GPUDashboardTabProps) {
  const { t } = useTranslation(['cards', 'common'])

  // Derive overall health status from summary
  const healthStatus = healthSummary
    ? healthSummary.offline > 0
      ? 'offline'
      : healthSummary.degraded > 0
        ? 'degraded'
        : 'healthy'
    : null

  return (
    <div className="space-y-4">
      {/* Health status indicator */}
      {healthSummary && (
        <div
          data-testid="gpu-health-indicator"
          className="flex items-center gap-4 px-4 py-2 rounded-lg border bg-card/50 text-sm"
          aria-label="GPU cluster health status"
        >
          <span className="text-muted-foreground font-medium">{t('consoleOfflineDetection.gpuHealth')}:</span>
          {healthSummary.healthy > 0 && (
            <span className="flex items-center gap-1.5 text-green-400">
              <CheckCircle className="w-4 h-4" aria-hidden="true" />
              {healthSummary.healthy} {t('common:common.healthy')}
            </span>
          )}
          {healthSummary.degraded > 0 && (
            <span className="flex items-center gap-1.5 text-yellow-400">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              {healthSummary.degraded} {t('common:common.degraded')}
            </span>
          )}
          {healthSummary.offline > 0 && (
            <span className="flex items-center gap-1.5 text-red-400">
              <WifiOff className="w-4 h-4" aria-hidden="true" />
              {healthSummary.offline} {t('common:common.offline')}
            </span>
          )}
          {healthStatus === 'healthy' && (
            <span className="ml-auto text-xs text-green-400">{t('consoleOfflineDetection.allHealthy')}</span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t('gpuReservations.dashboard.customizable')}
        </p>
        <button
          onClick={onShowAddCardModal}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('gpuReservations.dashboard.addCard')}
        </button>
      </div>
      <DndContext
        sensors={gpuDashSensors}
        collisionDetection={closestCenter}
        onDragEnd={onDashDragEnd}
      >
        <SortableContext items={dashCardIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-12 gap-2">
            {dashboardCards.map((card, index) => (
              <SortableGpuCard
                key={dashCardIds[index]}
                id={dashCardIds[index]}
                card={card}
                index={index}
                forceLive={gpuLiveMode}
                onRemove={() => onRemoveDashboardCard(index)}
                onWidthChange={(newWidth) => onDashCardWidthChange(index, newWidth)}
                onRefresh={onTriggerRefresh}
                isRefreshing={isRefreshingDashboard}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {dashboardCards.length === 0 && (
        <div className="p-12 rounded-lg bg-card/50 border border-border text-center">
          <LayoutDashboard className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">{t('gpuReservations.dashboard.noCardsYet')}</p>
          <button
            onClick={onShowAddCardModal}
            className="mt-3 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600 transition-colors"
          >
            {t('gpuReservations.dashboard.addFirstCard')}
          </button>
        </div>
      )}
    </div>
  )
}
