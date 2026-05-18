import { Suspense, useMemo } from 'react'
import { X, ChevronRight, ChevronLeft, Loader2, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Plus, Sparkles, Send, Globe, Bookmark, Play, Trash2, CheckCircle2, Eye, ShieldOff, Rocket, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isActiveMission, useMissions, type Mission } from '../../../hooks/useMissions'
import { useMobile } from '../../../hooks/useMobile'
import { safeLazy } from '../../../lib/safeLazy'
import { ConfirmDialog } from '../../../lib/modals'
import { cn } from '../../../lib/cn'
import { FOCUS_DELAY_MS } from '../../../lib/constants/network'
import { isDemoMode } from '../../../lib/demoMode'
import { StatusBadge } from '../../ui/StatusBadge'
import { AgentSelector } from '../../agent/AgentSelector'
import { LogoWithStar } from '../../ui/LogoWithStar'
import { MissionControlDialog } from '../../mission-control/MissionControlDialog'
import { MissionDetailView } from '../../missions/MissionDetailView'
import { StandaloneOrbitDialog } from '../../missions/StandaloneOrbitDialog'
import { MissionChat } from './MissionChat'
import { ClusterSelectionDialog } from '../../missions/ClusterSelectionDialog'
import { SaveResolutionDialog } from '../../missions/SaveResolutionDialog'
import { SidebarResizeHandle } from './SidebarResizeHandle'
import { MissionResolution } from './MissionResolution'
import { MissionListPanel } from './MissionListPanel'
import { FULLSCREEN_KNOWLEDGE_PANEL_WIDTH_CLASS, MISSION_CONTROL_BUTTON_CLASSES, getMissionAttentionCount } from './MissionSidebarConstants'
import { useMissionSidebarState } from './useMissionSidebarState'
const MissionBrowser = safeLazy(() => import('../../missions/MissionBrowser'), 'MissionBrowser')
export function MissionSidebar() {
  const { t } = useTranslation(['common'])
  const {
    missions, activeMission, isSidebarOpen, isSidebarMinimized, isFullScreen, setActiveMission, closeSidebar, dismissMission, cancelMission, minimizeSidebar, expandSidebar, setFullScreen, selectedAgent, startMission, runSavedMission, isMobile, collapsedMissions, showAddMenu,
    setShowAddMenu, addMenuRef, missionsPageSize, visibleMissionCount, setVisibleMissionCount, sidebarWidth, isResizing, isTablet, handleResizeStart, showNewMission, setShowNewMission, showBrowser, showMissionControl, setShowMissionControl, missionControlFreshSessionToken,
    setMissionControlFreshSessionToken, pendingKubaraChart, setPendingKubaraChart, pendingReviewPlan, setPendingReviewPlan, showOrbitDialog, setShowOrbitDialog, orbitDialogPrefill, setOrbitDialogPrefill, newMissionPrompt, setNewMissionPrompt, showSavedToast, setShowSavedToast,
    toastCountdown, setToastCountdown, viewingMission, setViewingMission, viewingMissionRaw, setViewingMissionRaw, pendingDismissMissionId, setPendingDismissMissionId, newMissionInputRef, pendingRunMissionId, setPendingRunMissionId, pendingMission, isDirectImporting,
    showSaveResolutionDialog, setShowSaveResolutionDialog, resolutionPanelView, setResolutionPanelView, relatedResolutions, allResolutions, handleApplyResolution, deepLinkMission, openMissionBrowser, closeMissionBrowser, openFreshMissionControl, openExistingMissionControl,
    missionSearchQuery, setMissionSearchQuery, showHistoryPanel, setShowHistoryPanel, lastPanelView, setLastPanelView, toggleHistoryPanel, savedMissions, activeMissions, visibleActiveMissions, hasMoreMissions, listTotalMissions, handleImportMission, handleViewSavedMission,
    handleRunMission, needsAttention, runningMissions, runningMissionPreview, runningCount, toggleMissionCollapse, handleRollback, shouldRenderMinimizedSidebar, shouldRenderExpandedSidebar,
  } = useMissionSidebarState()
  const getRunningMissionStatusLabel = (status: Mission['status']) => {
    switch (status) {
      case 'pending':
        return t('missionSidebar.statusLabels.pending', { defaultValue: 'Starting…' })
      case 'cancelling':
        return t('missionSidebar.statusLabels.cancelling', { defaultValue: 'Cancelling…' })
      case 'running':
      default:
        return t('missionSidebar.statusLabels.running', { defaultValue: 'Running' })
    }
  }
  const sidebarSavedMissionItems = useMemo(() => savedMissions.map(m => (
    <div
      key={m.id}
      className="group flex items-center gap-3 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-colors cursor-pointer"
      onClick={() => handleViewSavedMission(m)}
    >
      <Bookmark className="w-4 h-4 text-purple-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
        <p className="text-xs text-muted-foreground truncate">{m.description}</p>
        {m.importedFrom?.tags && m.importedFrom.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {m.importedFrom.tags.slice(0, 4).map(tag => (
              <span key={tag} className="text-2xs px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); handleViewSavedMission(m) }}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
          title={t('layout.missionSidebar.viewMissionDetails')}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleRunMission(m.id) }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          title={t('layout.missionSidebar.runThisMission')}
        >
          <Play className="w-3 h-3" /> {t('layout.missionSidebar.run')}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setPendingDismissMissionId(m.id) }}
          className="p-1.5 text-muted-foreground hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
          title={t('layout.missionSidebar.removeFromLibrary')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )), [handleRunMission, handleViewSavedMission, savedMissions, t])
  if (shouldRenderMinimizedSidebar) {
    return (
      <div
        className={cn(
        "fixed top-16 right-0 bottom-0 w-12 bg-card/95 backdrop-blur-xs border-l border-border shadow-xl z-sidebar flex flex-col items-center py-4",
        "transition-transform duration-300 ease-in-out"
      )}>
        <button
          onClick={expandSidebar}
          className="p-2 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10 mb-4"
          title={t('missionSidebar.expandSidebar')}
        >
          <PanelRightOpen className="w-5 h-5 text-muted-foreground" />
        </button>
        <div className="flex flex-col items-center gap-2">
          <LogoWithStar className="w-5 h-5" />
          {activeMissions.length > 0 && (
            <span className="text-xs font-medium text-foreground">{activeMissions.length}</span>
          )}
          {runningCount > 0 && (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          )}
          {needsAttention > 0 && (
            <span className="w-5 h-5 flex items-center justify-center text-xs bg-purple-500/20 text-purple-400 rounded-full">
              {needsAttention}
            </span>
          )}
        </div>
      </div>
    )
  }
  return (
    <>
      {shouldRenderExpandedSidebar && (
        <>
          {isMobile && (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-overlay md:hidden"
              onClick={closeSidebar}
              tabIndex={-1}
              aria-hidden="true"
            />
          )}
          {!isMobile && isTablet && !isFullScreen && (
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs z-overlay lg:hidden"
              onClick={closeSidebar}
              tabIndex={-1}
              aria-hidden="true"
            />
          )}
          <div
            data-tour="ai-missions"
            data-testid="mission-sidebar"
            className={cn(
              "fixed bg-card border-border flex min-h-0 flex-col overflow-hidden shadow-2xl",
              isMobile ? "z-modal" : "z-sidebar",
              !isResizing && "transition-[width,top,border,transform] duration-300 ease-in-out",
              isMobile && "inset-x-0 bottom-0 rounded-t-2xl border-t max-h-[80vh] max-h-[80dvh] translate-y-0",
              !isMobile && isFullScreen && "inset-0 top-16 border-l-0 rounded-none",
              !isMobile && !isFullScreen && "top-16 right-0 bottom-0 border-l shadow-xl"
            )}
            style={!isMobile && !isFullScreen ? { width: sidebarWidth } : undefined}
          >
      {!isMobile && !isFullScreen && isSidebarOpen && (
        <SidebarResizeHandle
          onResizeStart={handleResizeStart}
          label={t('missionSidebar.resizeHandleTooltip')}
        />
      )}
      {isMobile && (
        <div className="flex justify-center py-2 md:hidden">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
      )}
      <div className="flex items-center gap-2 p-3 md:p-4 border-b border-border min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <LogoWithStar className="w-5 h-5 shrink-0" />
          <h2 className="font-semibold text-foreground text-sm md:text-base truncate">{t('missionSidebar.aiMissions')}</h2>
          {needsAttention > 0 && (
            <StatusBadge color="purple" rounded="full">{needsAttention}</StatusBadge>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0" role="toolbar" aria-label={t('missionSidebar.headerActions', { defaultValue: 'Mission panel actions' })}>
          <div className="relative mr-1 shrink-0" ref={addMenuRef}>
            <button
              type="button"
              onClick={() => setShowAddMenu(prev => !prev)}
              className={cn(
                "p-1.5 rounded transition-colors ring-1",
                showAddMenu
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "bg-purple-500/10 text-purple-400 ring-purple-500/30 hover:bg-purple-500/20 hover:text-purple-300"
              )}
              aria-label="Add"
              title="Add"
            >
              <Plus className="w-4 h-4" />
            </button>
            {showAddMenu && (
              <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-lg border border-border bg-background shadow-lg py-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false)
                    setShowNewMission(true)
                    setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
                >
                  <Plus className="w-4 h-4 text-purple-400" />
                  New Mission
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddMenu(false); openMissionBrowser() }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
                >
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  Browse Community
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddMenu(false); openFreshMissionControl() }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
                >
                  <Rocket className="w-4 h-4 text-muted-foreground" />
                  Mission Control
                </button>
                {isMobile && listTotalMissions > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddMenu(false)
                      if (activeMission) {
                        setActiveMission(null)
                        setShowHistoryPanel(true)
                      } else {
                        toggleHistoryPanel()
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
                  >
                    <History className="w-4 h-4 text-muted-foreground" />
                    {showHistoryPanel
                      ? t('missionSidebar.hideHistory', { defaultValue: 'Hide History' })
                      : t('missionSidebar.showHistory', { defaultValue: 'Show History' })}
                    {!showHistoryPanel && listTotalMissions > 0 && (
                      <span className="ml-auto text-2xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">{listTotalMissions}</span>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
          {!isMobile && (
            <button
              onClick={() => {
                if (activeMission) {
                  setActiveMission(null)
                  setShowHistoryPanel(true)
                } else {
                  toggleHistoryPanel()
                }
              }}
              className={cn(
                "relative p-1.5 rounded transition-colors ring-1 mr-1 shrink-0",
                showHistoryPanel && !activeMission
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "bg-secondary/50 text-muted-foreground ring-border hover:bg-secondary hover:text-foreground"
              )}
              aria-label={t('missionSidebar.toggleHistory', { defaultValue: 'Toggle mission history' })}
              title={t('missionSidebar.toggleHistory', { defaultValue: 'Toggle mission history' })}
            >
              <History className="w-4 h-4" />
              {listTotalMissions > 0 && !showHistoryPanel && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-medium bg-purple-500 text-white rounded-full px-1">
                  {listTotalMissions}
                </span>
              )}
            </button>
          )}
          <div className="flex items-center gap-1 min-w-0 shrink-0">
            <AgentSelector compact={!isFullScreen} className="shrink-0" />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!isMobile && (isFullScreen ? (
              <button
                onClick={() => setFullScreen(false)}
                className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                aria-label={t('missionSidebar.exitFullScreen')}
                title={t('missionSidebar.exitFullScreen')}
              >
                <Minimize2 className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => setFullScreen(true)}
                  className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label={t('missionSidebar.fullScreen')}
                  title={t('missionSidebar.fullScreen')}
                >
                  <Maximize2 className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                </button>
                <button
                  onClick={minimizeSidebar}
                  className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  aria-label={t('missionSidebar.minimizeSidebar')}
                  title={t('missionSidebar.minimizeSidebar')}
                >
                  <PanelRightClose className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                </button>
              </>
            ))}
            <button
              onClick={closeSidebar}
              className="min-w-[44px] min-h-[44px] p-2 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center"
              aria-label={t('missionSidebar.closeSidebar')}
              title={t('missionSidebar.closeSidebar')}
            >
              <X className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      {showNewMission && (
        <div className="p-3 border-b border-border bg-secondary/30">
          <div className="flex flex-col gap-2">
            <textarea
              ref={newMissionInputRef}
              value={newMissionPrompt}
              onChange={(e) => setNewMissionPrompt(e.target.value)}
              placeholder={t('missionSidebar.newMissionPlaceholder')}
              className="w-full min-h-[80px] p-2 text-sm bg-background border border-border rounded-lg resize-none focus:outline-hidden focus:ring-2 focus:ring-primary/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && newMissionPrompt.trim()) {
                  startMission({
                    type: 'custom',
                    title: newMissionPrompt.slice(0, 50) + (newMissionPrompt.length > 50 ? '...' : ''),
                    description: newMissionPrompt,
                    initialPrompt: newMissionPrompt,
                    skipReview: true })
                  setNewMissionPrompt('')
                  setShowNewMission(false)
                }
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-2xs text-muted-foreground">
                {isMobile ? t('missionSidebar.tapSend') : t('missionSidebar.cmdEnterSubmit')}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowNewMission(false)
                    setNewMissionPrompt('')
                  }}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('missionSidebar.cancel')}
                </button>
                <button
                  onClick={() => {
                    if (newMissionPrompt.trim()) {
                      startMission({
                        type: 'custom',
                        title: newMissionPrompt.slice(0, 50) + (newMissionPrompt.length > 50 ? '...' : ''),
                        description: newMissionPrompt,
                        initialPrompt: newMissionPrompt,
                        skipReview: true })
                      setNewMissionPrompt('')
                      setShowNewMission(false)
                    }
                  }}
                  disabled={!newMissionPrompt.trim()}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-3 h-3" />
                  {t('missionSidebar.start')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {selectedAgent === 'none' && (
        <div className="mx-3 mt-2 p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg flex items-center gap-2">
          <ShieldOff className="w-4 h-4 text-cyan-400 shrink-0" />
          <p className="text-xs text-cyan-400">{t('agent.aiPausedBanner')}</p>
        </div>
      )}
      {showSavedToast && (
        <div className="mx-3 mt-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <p className="text-sm font-medium text-green-400">{t('layout.missionSidebar.missionImported')}</p>
            {toastCountdown > 0 && (
              <span className="text-2xs text-green-400/70 ml-auto">{toastCountdown}s</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mb-2">{showSavedToast}</p>
          {toastCountdown > 0 && (
            <p className="text-2xs text-muted-foreground/70 mb-2">
              {isDemoMode()
                ? t('layout.missionSidebar.useButtonToStart')
                : t('layout.missionSidebar.missionReady')
              }
            </p>
          )}
          <button
            type="button"
            onClick={() => { setShowSavedToast(null); setToastCountdown(0) }}
            className="text-2xs text-green-400/70 hover:text-green-400"
          >
            {t('common.dismiss', 'Dismiss')}
          </button>
        </div>
      )}
      {isDirectImporting && (
        <div className="mx-3 mt-2 p-2.5 bg-secondary/30 border border-border rounded-lg flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
          <p className="text-xs text-muted-foreground">{t('missionSidebar.importingMission', 'Importing mission...')}</p>
        </div>
      )}
      {runningMissions.length > 0 && !activeMission && !showHistoryPanel && (
        <div className="mx-3 mt-2 rounded-lg border border-primary/30 bg-primary/10 p-3">
          <div className="flex items-start gap-2">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {t('missionSidebar.backgroundMissionsRunning', { count: runningMissions.length })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('missionSidebar.backgroundMissionsHint', { defaultValue: 'Missions keep running even if you close Mission Control or this panel. Open history to follow live status and progress.' })}
              </p>
              <div className="mt-3 space-y-2">
                {runningMissionPreview.map((mission) => (
                  <button
                    key={mission.id}
                    type="button"
                    onClick={() => {
                      setLastPanelView('history')
                      setActiveMission(mission.id)
                    }}
                    className="w-full rounded-md border border-primary/20 bg-background/60 px-2.5 py-2 text-left transition-colors hover:bg-background"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">{mission.title}</span>
                      <span className="shrink-0 text-2xs text-primary">{getRunningMissionStatusLabel(mission.status)}</span>
                    </div>
                    <p className="mt-1 truncate text-2xs text-muted-foreground">{mission.currentStep || mission.description}</p>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-2xs text-muted-foreground">
                  {runningMissions.length > BACKGROUND_MISSION_PREVIEW_LIMIT
                    ? t('missionSidebar.moreRunningMissions', {
                        count: runningMissions.length - BACKGROUND_MISSION_PREVIEW_LIMIT,
                        defaultValue: '+{{count}} more running in history',
                      })
                    : t('missionSidebar.backgroundMissionsPersist', {
                        defaultValue: 'Closing this view will not stop the running missions.',
                      })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLastPanelView('history')
                    setShowHistoryPanel(true)
                  }}
                  className="shrink-0 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                >
                  {t('missionSidebar.viewRunningMissions', { defaultValue: 'View running missions' })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {listTotalMissions === 0 && !missionSearchQuery.trim() && !activeMission && !showHistoryPanel ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Sparkles className="w-10 h-10 text-purple-400/60 mb-4" />
          <p className="text-muted-foreground">{t('missionSidebar.noActiveMissions')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {t('missionSidebar.startMissionPrompt')}
          </p>
          <div className="flex flex-col gap-2.5 mt-5 w-full max-w-xs">
            {!showNewMission && (
              <button
                type="button"
                onClick={() => {
                  setShowNewMission(true)
                  setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
                }}
                className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Sparkles className="w-5 h-5 shrink-0" />
                <span className="text-left leading-snug">{t('missionSidebar.startCustomMission')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => openMissionBrowser()}
              className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
            >
              <Globe className="w-5 h-5 shrink-0" />
              <span className="text-left leading-snug">{t('layout.missionSidebar.browseCommunityMissions')}</span>
            </button>
            <button
              type="button"
              onClick={openFreshMissionControl}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                MISSION_CONTROL_BUTTON_CLASSES
              )}
            >
              <Rocket className="w-5 h-5 shrink-0" />
              <span className="text-left leading-snug">{t('layout.missionSidebar.missionControl')}</span>
            </button>
          </div>
        </div>
      ) : activeMission ? (
        <div className={cn(
          "flex-1 flex min-h-0 min-w-0 overflow-hidden",
          isFullScreen && "w-full"
        )}>
          {isFullScreen && (
            <MissionResolution
              savedMissions={savedMissions}
              relatedResolutions={relatedResolutions}
              allResolutionsCount={allResolutions.length}
              resolutionPanelView={resolutionPanelView}
              onSetResolutionPanelView={setResolutionPanelView}
              onApplyResolution={handleApplyResolution}
              onSaveNewResolution={() => setShowSaveResolutionDialog(true)}
              onViewMission={handleViewSavedMission}
              onRunMission={handleRunMission}
              onRemoveMission={(id) => setPendingDismissMissionId(id)}
              panelWidthClass={FULLSCREEN_KNOWLEDGE_PANEL_WIDTH_CLASS}
            />
          )}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {activeMission != null && (
              <button
                onClick={() => {
                  setActiveMission(null)
                  if (lastPanelView === 'history') {
                    setShowHistoryPanel(true)
                  }
                }}
                className="flex items-center gap-1 px-4 py-2 text-xs text-muted-foreground hover:text-foreground border-b border-border shrink-0"
              >
                <ChevronLeft className="w-3 h-3" />
                {t('missionSidebar.backToMissions', { count: listTotalMissions })}
              </button>
            )}
            <MissionChat
              key={activeMission?.id}
              mission={activeMission}
              isFullScreen={isFullScreen}
              onToggleFullScreen={() => setFullScreen(true)}
              onOpenOrbitDialog={(prefill) => {
                setOrbitDialogPrefill(prefill)
                setShowOrbitDialog(true)
              }}
            />
          </div>
        </div>
      ) : !showHistoryPanel ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Sparkles className="w-10 h-10 text-purple-400/60 mb-4" />
          <p className="text-foreground font-medium">{t('missionSidebar.readyToHelp', { defaultValue: 'Ready to help' })}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {t('missionSidebar.startMissionPrompt')}
          </p>
          <div className="mt-4 grid w-full max-w-sm grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2">
            {!showNewMission && (
              <button
                type="button"
                onClick={() => {
                  setLastPanelView('dashboard')
                  setShowNewMission(true)
                  setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
                }}
                className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Sparkles className="h-6 w-6 shrink-0" />
                <span className="max-w-full text-center text-xs leading-tight whitespace-normal break-words">{t('missionSidebar.startCustomMission')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => openMissionBrowser()}
              className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
            >
              <Globe className="h-6 w-6 shrink-0" />
              <span className="max-w-full text-center text-xs leading-tight whitespace-normal break-words">{t('layout.missionSidebar.browseCommunityMissions')}</span>
            </button>
            <button
              type="button"
              onClick={openFreshMissionControl}
              className={cn(
                'flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                MISSION_CONTROL_BUTTON_CLASSES
              )}
            >
              <Rocket className="h-6 w-6 shrink-0" />
              <span className="max-w-full text-center text-xs leading-tight whitespace-normal break-words">{t('layout.missionSidebar.missionControl')}</span>
            </button>
          </div>
          {listTotalMissions > 0 && (
            <button
              type="button"
              onClick={toggleHistoryPanel}
              className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-primary cursor-pointer hover:underline underline-offset-2 transition-colors rounded-md px-2 py-1 -mx-2 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
            >
              <History className="w-3.5 h-3.5" />
              {t('missionSidebar.viewHistory', {
                defaultValue: 'View {{count}} previous missions',
                count: listTotalMissions })}
            </button>
          )}
        </div>
      ) : (
        <MissionListPanel
          missions={missions}
          savedMissions={savedMissions}
          activeMissions={activeMissions}
          visibleActiveMissions={visibleActiveMissions}
          hasMoreMissions={hasMoreMissions}
          visibleMissionCount={visibleMissionCount}
          onLoadMore={() => setVisibleMissionCount(prev => prev + missionsPageSize)}
          missionSearchQuery={missionSearchQuery}
          onSearchChange={setMissionSearchQuery}
          collapsedMissions={collapsedMissions}
          onToggleCollapse={toggleMissionCollapse}
          onSelectMission={(id) => {
            setLastPanelView('history')
            setActiveMission(id)
          }}
          onDismissMission={dismissMission}
          onCancelMission={cancelMission}
          onExpandMission={(id) => {
            setLastPanelView('history')
            setActiveMission(id)
            setFullScreen(true)
          }}
          onRollback={handleRollback}
          onOpenMissionControl={openExistingMissionControl}
          onOpenOrbitDialog={() => setShowOrbitDialog(true)}
          onRunSavedMission={runSavedMission}
          isFullScreen={isFullScreen}
          savedMissionItems={sidebarSavedMissionItems}
        />
      )}
          </div>
        </>
      )}
      {viewingMission && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs"
          onClick={(e) => { if (e.target === e.currentTarget) setViewingMission(null) }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setViewingMission(null) } }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className={cn(
            "relative bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col",
            isMobile ? "inset-2 fixed" : "w-[900px] max-h-[85vh]"
          )}>
            <div className="flex justify-end p-3 pb-0 shrink-0">
              <button
                onClick={() => setViewingMission(null)}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scroll-enhanced px-6 pb-6">
              <MissionDetailView
                mission={viewingMission}
                rawContent={JSON.stringify(viewingMission, null, 2)}
                showRaw={viewingMissionRaw}
                onToggleRaw={() => setViewingMissionRaw(prev => !prev)}
                onImport={() => {
                  const match = savedMissions.find(m => m.title === viewingMission.title)
                  if (match) handleRunMission(match.id)
                  setViewingMission(null)
                }}
                onBack={() => setViewingMission(null)}
                importLabel="Run"
                hideBackButton
              />
            </div>
          </div>
        </div>
      )}
      <Suspense fallback={null}>
        <MissionBrowser
          isOpen={showBrowser}
          onClose={closeMissionBrowser}
          onImport={handleImportMission}
          initialMission={deepLinkMission || undefined}
          onUseInMissionControl={(chartName: string) => {
            closeMissionBrowser()
            setPendingKubaraChart(chartName)
            setPendingReviewPlan(undefined)
            setMissionControlFreshSessionToken(undefined)
            setShowMissionControl(true)
          }}
        />
      </Suspense>
      <MissionControlDialog
        open={showMissionControl}
        onClose={() => {
          setShowMissionControl(false)
          setPendingKubaraChart(undefined)
          setPendingReviewPlan(undefined)
          setMissionControlFreshSessionToken(undefined)
        }}
        initialKubaraChart={pendingKubaraChart}
        reviewPlanEncoded={pendingReviewPlan}
        freshSessionToken={missionControlFreshSessionToken}
      />
      {showOrbitDialog && (
        <StandaloneOrbitDialog
          onClose={() => { setShowOrbitDialog(false); setOrbitDialogPrefill(undefined) }}
          prefill={orbitDialogPrefill}
        />
      )}
      {pendingRunMissionId && (
        <ClusterSelectionDialog
          open
          missionTitle={pendingMission?.title ?? 'Mission'}
          onSelect={(clusters) => {
            runSavedMission(pendingRunMissionId, clusters.length > 0 ? clusters.join(',') : undefined)
            setPendingRunMissionId(null)
          }}
          onCancel={() => setPendingRunMissionId(null)}
        />
      )}
      {activeMission && showSaveResolutionDialog && (
        <SaveResolutionDialog
          mission={activeMission}
          isOpen={showSaveResolutionDialog}
          onClose={() => setShowSaveResolutionDialog(false)}
          onSaved={() => setResolutionPanelView('history')}
        />
      )}
      <ConfirmDialog
        isOpen={pendingDismissMissionId !== null}
        onClose={() => setPendingDismissMissionId(null)}
        onConfirm={() => {
          if (pendingDismissMissionId) dismissMission(pendingDismissMissionId)
          setPendingDismissMissionId(null)
        }}
        title={t('layout.missionSidebar.deleteMission')}
        message={t('layout.missionSidebar.deleteMissionConfirm')}
        confirmLabel={t('common.delete')}
        variant="danger"
      />
    </>
  )
}
export function MissionSidebarToggle() {
  const { t } = useTranslation(['common'])
  const { missions, isSidebarOpen, openSidebar } = useMissions()
  const { isMobile } = useMobile()
  const needsAttention = getMissionAttentionCount(missions)
  const runningCount = missions.filter(m => m.status === 'running').length
  const activeCount = missions.filter(isActiveMission).length
  if (isSidebarOpen) {
    return null
  }
  return (
    <button
      type="button"
      onClick={openSidebar}
      data-tour="ai-missions-toggle"
      data-testid="mission-sidebar-toggle"
      className={cn(
        'fixed flex items-center gap-2 rounded-full border border-border bg-card text-foreground shadow-lg transition-all z-50 hover:bg-secondary',
        isMobile ? 'px-3 py-2 right-4 bottom-4' : 'px-4 py-3 right-4 bottom-4',
        needsAttention > 0 && 'ring-2 ring-purple-500/30'
      )}
      title={t('missionSidebar.openAIMissions')}
    >
      <LogoWithStar className={cn(isMobile ? 'w-4 h-4' : 'w-5 h-5', needsAttention > 0 && 'text-purple-400')} />
      {runningCount > 0 && (
        <Loader2 className={isMobile ? 'w-3 h-3 animate-spin text-purple-400' : 'w-4 h-4 animate-spin text-purple-400'} />
      )}
      <span className={cn(isMobile ? 'text-xs' : 'text-sm', needsAttention > 0 && 'font-medium')}>
        {activeCount > 0 ? t('missionSidebar.missionCount', { count: activeCount }) : t('missionSidebar.aiMissions')}
      </span>
      {needsAttention > 0 && (
        <StatusBadge color="purple" size={isMobile ? 'xs' : 'sm'} variant="solid" rounded="full">
          {needsAttention}
        </StatusBadge>
      )}
      <ChevronRight className={cn(isMobile ? 'w-3 h-3' : 'w-4 h-4', isMobile && '-rotate-90', needsAttention > 0 && 'text-purple-400')} />
    </button>
  )
}
