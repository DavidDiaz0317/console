import { Suspense } from 'react'
import type { Location } from 'react-router-dom'
import { Routes } from 'react-router-dom'
import { AuthProvider } from '@/lib/auth'
import { UnifiedDemoProvider } from '@/lib/unified/demo'
import { RewardsProvider } from '@/hooks/useRewards'
import { ToastProvider } from '@/components/ui/Toast'
import { GlobalFiltersProvider } from '@/hooks/useGlobalFilters'
import { MissionProvider } from '@/hooks/useMissions'
import { CardEventProvider } from '@/lib/cardEvents'
import { AlertsProvider } from '@/contexts/AlertsContext'
import { DashboardProvider } from '@/hooks/useDashboardContext'
import { DrillDownProvider } from '@/hooks/useDrillDown'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import { PageErrorBoundary } from '@/components/PageErrorBoundary'
import { ChunkErrorBoundary } from '@/components/ChunkErrorBoundary'
import { NPSSurvey } from '@/components/feedback'
import { safeLazy } from '@/lib/safeLazy'
import { SettingsSyncInit } from './SettingsSyncInit'
import { PageViewTracker } from './PageViewTracker'
import { DataPrefetchInit } from './DataPrefetchInit'
import { OrbitAutoRunner } from './OrbitAutoRunner'

const DrillDownModal = safeLazy(() => import('@/components/drilldown/DrillDownModal'), 'DrillDownModal')

/** Full dashboard app with all providers — loaded only for non-mission routes */
export function FullDashboardApp({ liveLocation, children }: { liveLocation: Location; children: React.ReactNode }) {
  return (
    <AuthProvider>
    <SettingsSyncInit />
    <PageViewTracker />
    <DataPrefetchInit />
    <UnifiedDemoProvider>
      <RewardsProvider>
      <ToastProvider>
      <GlobalFiltersProvider>
      <MissionProvider>
      <CardEventProvider>
      <AlertsProvider>
      <DashboardProvider>
      <DrillDownProvider>
      <AppErrorBoundary>
      <PageErrorBoundary>
        <Suspense fallback={null}><DrillDownModal /></Suspense>
      </PageErrorBoundary>
      <PageErrorBoundary>
        <NPSSurvey />
      </PageErrorBoundary>
      <OrbitAutoRunner />
      <ChunkErrorBoundary>
      <PageErrorBoundary>
      <Routes location={liveLocation}>
        {children}
      </Routes>
      </PageErrorBoundary>
      </ChunkErrorBoundary>
      </AppErrorBoundary>
      </DrillDownProvider>
      </DashboardProvider>
      </AlertsProvider>
      </CardEventProvider>
      </MissionProvider>
      </GlobalFiltersProvider>
      </ToastProvider>
      </RewardsProvider>
    </UnifiedDemoProvider>
    </AuthProvider>
  )
}
