import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/router'
import { X, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMobile } from '@/hooks/useMobile'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { useMissions } from '@/contexts/MissionContext'
import { useResolutions } from '@/contexts/ResolutionContext'
import { isDemoMode } from '@/lib/demoMode'
import MissionChat from '@/components/mission-chat/MissionChat'
import MissionListPanel from '@/components/mission-list/MissionListPanel'
import MissionResolution from '@/components/mission-resolution/MissionResolution'
import MissionBrowser from '@/components/mission-browser/MissionBrowser'
import MissionControlDialog from '@/components/mission-control/MissionControlDialog'
import StandaloneOrbitDialog from '@/components/missions/StandaloneOrbitDialog'
import ClusterSelectionDialog from '../../../components/missions/ClusterSelectionDialog'
import SaveResolutionDialog from '@/components/mission-resolution/SaveResolutionDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/cn'

import { useMissionSidebarState } from './useMissionSidebarState'
import {
  useMissionBrowserDeepLink,
  useMissionControlDeepLink,
  useDirectImport,
} from './useMissionSidebarDeepLinks'
import {
  handleApplyResolution,
  handleRollback,
  handleImportMission,
  savedMissionToExport,
} from './missionSidebarHelpers'
import { useSavedMissionItems } from './useSavedMissionItems'
import { MissionSidebarMinimized } from './MissionSidebarMinimized'
import { MissionSidebarHeader } from './MissionSidebarHeader'
import { MissionSidebarNewMission } from './MissionSidebarNewMission'
import { MissionSidebarRunningBanner } from './MissionSidebarRunningBanner'
import { MissionSidebarDashboard } from './MissionSidebarDashboard'
import { MissionSidebarEmptyState } from './MissionSidebarEmptyState'
import { matchesMissionSearch } from './missionSidebarConstants'

export function MissionSidebar() {
  const router = useRouter()
  const isMobile = useMobile()

  // Core context hooks
  const {
    missions,
    activeMissionId,
    setActiveMission,
    closeMission,
    clearAllMissions,
    addMission,
    updateMission,
    saveMission,
    deleteSavedMission,
    savedMissions,
    getCurrentMissionHistory,
    agentProvider,
    setAgentProvider,
  } = useMissions()

  const { saveResolution, rollbackMission } = useResolutions()

  // Sidebar resize logic
  const { sidebarWidth, handleMouseDown, isDragging } = useSidebarResize({
    minWidth: 360,
    maxWidth: 800,
    defaultWidth: 480,
    localStorageKey: 'mission-sidebar-width',
  })

  // Main state hook (missions, dialogs, search, pagination, toast, etc.)
  const {
    isMinimized,
    setIsMinimized,
    isFullscreen,
    setIsFullscreen,
    showNewMissionInput,
    setShowNewMissionInput,
    newMissionInput,
    setNewMissionInput,
    selectedProvider,
    setSelectedProvider,
    viewMode,
    setViewMode,
    isHistoryOpen,
    setIsHistoryOpen,
    showBrowser,
    setShowBrowser,
    showMissionControl,
    setShowMissionControl,
    showStandaloneOrbit,
    setShowStandaloneOrbit,
    showClusterSelection,
    setShowClusterSelection,
    showSaveResolution,
    setShowSaveResolution,
    showConfirmClearAll,
    setShowConfirmClearAll,
    confirmRollbackMissionId,
    setConfirmRollbackMissionId,
    searchQuery,
    setSearchQuery,
    runningMissions,
    attentionMissions,
    filteredMissions,
    activeMission,
    showRunningBanner,
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedMissions,
    savedToastId,
    savedToastCountdown,
    isDemoModeActive,
    autoOpenHistoryAttempted,
  } = useMissionSidebarState({ missions, activeMissionId, savedMissions })

  // Deep link hooks
  useMissionBrowserDeepLink({ showBrowser, setShowBrowser })
  useMissionControlDeepLink({ showMissionControl, setShowMissionControl })
  const { importLoading, importError } = useDirectImport({
    router,
    addMission,
    setActiveMission,
    setViewMode,
  })

  // Saved missions rendering
  const savedMissionElements = useSavedMissionItems({
    paginatedMissions,
    searchQuery,
    activeMissionId,
    setActiveMission,
    setViewMode,
    setIsHistoryOpen,
    deleteSavedMission,
    savedMissionToExport,
  })

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const toastIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Set CSS custom property for sidebar width
  useEffect(() => {
    document.documentElement.style.setProperty('--mission-sidebar-width', `${sidebarWidth}px`)
  }, [sidebarWidth])

  // Escape key handler for fullscreen/close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false)
        } else if (!isMinimized) {
          setIsMinimized(true)
        }
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isFullscreen, isMinimized, setIsFullscreen, setIsMinimized])

  // Cleanup toast interval on unmount
  useEffect(() => {
    return () => {
      if (toastIntervalRef.current) {
        clearInterval(toastIntervalRef.current)
      }
    }
  }, [])

  // Handlers using helper functions
  const handleApplyResolutionClick = useCallback(
    (missionId: string) => {
      handleApplyResolution({ missionId, missions, updateMission, setShowSaveResolution })
    },
    [missions, updateMission, setShowSaveResolution]
  )

  const handleConfirmRollback = useCallback(
    (missionId: string) => {
      handleRollback({ missionId, rollbackMission, updateMission })
      setConfirmRollbackMissionId(null)
    },
    [rollbackMission, updateMission, setConfirmRollbackMissionId]
  )

  const handleImport = useCallback(
    (file: File) => {
      handleImportMission({ file, addMission, setActiveMission, setViewMode, setIsHistoryOpen })
    },
    [addMission, setActiveMission, setViewMode, setIsHistoryOpen]
  )

  const handleStartNewMission = useCallback(() => {
    if (!newMissionInput.trim()) return

    const provider = selectedProvider || agentProvider
    const newMission = addMission(newMissionInput, provider)
    setActiveMission(newMission.id)
    setViewMode('chat')
    setShowNewMissionInput(false)
    setNewMissionInput('')
    setIsHistoryOpen(false)
  }, [
    newMissionInput,
    selectedProvider,
    agentProvider,
    addMission,
    setActiveMission,
    setViewMode,
    setShowNewMissionInput,
    setNewMissionInput,
    setIsHistoryOpen,
  ])

  const handleSaveResolution = useCallback(
    (name: string, description: string) => {
      const mission = missions.find((m) => m.id === activeMissionId)
      if (!mission?.suggestedResolution) return

      saveResolution({
        name,
        description,
        files: mission.suggestedResolution.files.map((f) => ({
          path: f.path,
          oldContent: f.oldContent || '',
          newContent: f.newContent,
        })),
      })

      setShowSaveResolution(false)
      toast.success('Resolution saved successfully')
    },
    [missions, activeMissionId, saveResolution, setShowSaveResolution]
  )

  const handleConfirmClearAll = useCallback(() => {
    clearAllMissions()
    setShowConfirmClearAll(false)
    setIsHistoryOpen(false)
    toast.success('All missions cleared')
  }, [clearAllMissions, setShowConfirmClearAll, setIsHistoryOpen])

  const handleShowMissionControl = useCallback(() => {
    setShowMissionControl(true)
    const newUrl = new URL(window.location.href)
    newUrl.searchParams.set('mission-control', 'open')
    window.history.pushState({}, '', newUrl.toString())
  }, [setShowMissionControl])

  const handleCloseMissionControl = useCallback(() => {
    setShowMissionControl(false)
    const newUrl = new URL(window.location.href)
    newUrl.searchParams.delete('mission-control')
    window.history.replaceState({}, '', newUrl.toString())
  }, [setShowMissionControl])

  const handleShowBrowser = useCallback(() => {
    setShowBrowser(true)
    const newUrl = new URL(window.location.href)
    newUrl.searchParams.set('browse', 'missions')
    window.history.pushState({}, '', newUrl.toString())
  }, [setShowBrowser])

  const handleCloseBrowser = useCallback(() => {
    setShowBrowser(false)
    const newUrl = new URL(window.location.href)
    newUrl.searchParams.delete('browse')
    window.history.replaceState({}, '', newUrl.toString())
  }, [setShowBrowser])

  const handleShowStandaloneOrbit = useCallback(() => {
    setShowStandaloneOrbit(true)
  }, [setShowStandaloneOrbit])

  const handleCloseStandaloneOrbit = useCallback(() => {
    setShowStandaloneOrbit(false)
  }, [setShowStandaloneOrbit])

  const handleShowClusterSelection = useCallback(() => {
    setShowClusterSelection(true)
  }, [setShowClusterSelection])

  const handleCloseClusterSelection = useCallback(() => {
    setShowClusterSelection(false)
  }, [setShowClusterSelection])

  const handleAgentProviderChange = useCallback(
    (provider: 'claude' | 'openai' | 'gemini') => {
      setAgentProvider(provider)
      setSelectedProvider(provider)
    },
    [setAgentProvider, setSelectedProvider]
  )

  // Minimized view (desktop only)
  if (isMinimized && !isMobile) {
    return (
      <MissionSidebarMinimized
        runningMissions={runningMissions}
        attentionMissions={attentionMissions}
        onExpand={() => setIsMinimized(false)}
      />
    )
  }

  // Main expanded sidebar
  return (
    <>
      {/* Backdrop for mobile/tablet */}
      {!isMinimized && (isMobile || (!isMobile && viewMode === 'chat' && isFullscreen)) && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => {
            if (isFullscreen) {
              setIsFullscreen(false)
            } else {
              setIsMinimized(true)
            }
          }}
        />
      )}

      {/* Sidebar container */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full bg-card border-l border-border flex flex-col z-50 transition-transform duration-200',
          isMinimized && 'translate-x-full',
          isFullscreen && 'left-0 w-full',
          !isFullscreen && 'w-full lg:w-[var(--mission-sidebar-width)]'
        )}
        style={
          !isFullscreen && !isMobile
            ? {
                width: `${sidebarWidth}px`,
              }
            : undefined
        }
      >
        {/* Resize handle (desktop, not fullscreen) */}
        {!isMobile && !isFullscreen && (
          <div
            className={cn(
              'absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors',
              isDragging && 'bg-primary'
            )}
            onMouseDown={handleMouseDown}
          />
        )}

        {/* Drag handle for mobile (visual only) */}
        {isMobile && (
          <div className="flex justify-center py-2 border-b border-border">
            <div className="w-12 h-1 bg-muted-foreground/30 rounded-full" />
          </div>
        )}

        {/* Header */}
        <MissionSidebarHeader
          isFullscreen={isFullscreen}
          setIsFullscreen={setIsFullscreen}
          isHistoryOpen={isHistoryOpen}
          setIsHistoryOpen={setIsHistoryOpen}
          agentProvider={agentProvider}
          onAgentProviderChange={handleAgentProviderChange}
          setIsMinimized={setIsMinimized}
          onShowBrowser={handleShowBrowser}
          onShowMissionControl={handleShowMissionControl}
          onShowStandaloneOrbit={handleShowStandaloneOrbit}
          onShowClusterSelection={handleShowClusterSelection}
          onImport={handleImport}
          onClearAll={() => setShowConfirmClearAll(true)}
          savedMissionsCount={savedMissions.length}
          attentionCount={attentionMissions.length}
        />

        {/* New mission input */}
        {showNewMissionInput && (
          <MissionSidebarNewMission
            value={newMissionInput}
            onChange={setNewMissionInput}
            onStart={handleStartNewMission}
            onCancel={() => {
              setShowNewMissionInput(false)
              setNewMissionInput('')
            }}
            textareaRef={textareaRef}
          />
        )}

        {/* AI paused banner */}
        {isDemoModeActive && activeMission?.status === 'paused' && (
          <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-sm text-yellow-400">
            AI responses are paused in demo mode
          </div>
        )}

        {/* Saved toast */}
        {savedToastId && savedToastCountdown !== null && (
          <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center justify-between text-sm">
            <span className="text-green-400">Mission saved successfully</span>
            <span className="text-muted-foreground">{savedToastCountdown}s</span>
          </div>
        )}

        {/* Direct import loading */}
        {importLoading && (
          <div className="px-4 py-3 bg-primary/10 border-b border-primary/20 flex items-center gap-2 text-sm text-primary">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Importing mission...</span>
          </div>
        )}

        {/* Direct import error */}
        {importError && (
          <div className="px-4 py-3 bg-destructive/10 border-b border-destructive/20 flex items-center justify-between text-sm">
            <span className="text-destructive">{importError}</span>
            <button
              onClick={() => {
                const newUrl = new URL(window.location.href)
                newUrl.searchParams.delete('import')
                window.history.replaceState({}, '', newUrl.toString())
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Running missions banner */}
        {showRunningBanner && (
          <MissionSidebarRunningBanner
            count={runningMissions.length}
            onClick={() => {
              setViewMode('list')
              setIsHistoryOpen(false)
            }}
          />
        )}

        {/* Content area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Empty state */}
          {!activeMission && missions.length === 0 && savedMissions.length === 0 && (
            <MissionSidebarEmptyState onNewMission={() => setShowNewMissionInput(true)} />
          )}

          {/* Dashboard view */}
          {!activeMission && (missions.length > 0 || savedMissions.length > 0) && viewMode === 'dashboard' && (
            <MissionSidebarDashboard
              runningCount={runningMissions.length}
              savedCount={savedMissions.length}
              onViewRunning={() => {
                setViewMode('list')
                setIsHistoryOpen(false)
              }}
              onViewHistory={() => {
                setViewMode('list')
                setIsHistoryOpen(true)
              }}
              onNewMission={() => setShowNewMissionInput(true)}
            />
          )}

          {/* Chat view */}
          {activeMission && viewMode === 'chat' && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <MissionChat
                mission={activeMission}
                onClose={() => {
                  closeMission(activeMission.id)
                  setViewMode('dashboard')
                }}
                onSave={() => {
                  saveMission(activeMission.id)

                  if (toastIntervalRef.current) {
                    clearInterval(toastIntervalRef.current)
                  }

                  const toastId = toast.success('Mission saved successfully', {
                    duration: 5000,
                  })

                  // Toast handled by state hook countdown
                }}
                onMinimize={() => {
                  setViewMode('list')
                }}
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              />
            </div>
          )}

          {/* Resolution view */}
          {activeMission && viewMode === 'resolution' && activeMission.suggestedResolution && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="border-b border-border px-4 py-3 flex items-center justify-between">
                <h3 className="font-medium">Suggested Resolution</h3>
                <button
                  onClick={() => setViewMode('chat')}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <MissionResolution
                resolution={activeMission.suggestedResolution}
                onApply={() => handleApplyResolutionClick(activeMission.id)}
                onReject={() => {
                  updateMission(activeMission.id, { suggestedResolution: null })
                  setViewMode('chat')
                }}
                onSave={() => setShowSaveResolution(true)}
                onRollback={() => setConfirmRollbackMissionId(activeMission.id)}
                canRollback={!!activeMission.appliedResolutions && activeMission.appliedResolutions.length > 0}
              />
            </div>
          )}

          {/* List view (running or history) */}
          {viewMode === 'list' && (
            <MissionListPanel
              missions={isHistoryOpen ? filteredMissions : runningMissions}
              activeMissionId={activeMissionId}
              onMissionClick={(missionId) => {
                setActiveMission(missionId)
                setViewMode('chat')
              }}
              onMissionClose={(missionId) => {
                closeMission(missionId)
                if (activeMissionId === missionId) {
                  setViewMode('dashboard')
                }
              }}
              isHistoryView={isHistoryOpen}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              savedMissionElements={isHistoryOpen ? savedMissionElements : null}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              onBackToDashboard={() => setViewMode('dashboard')}
            />
          )}
        </div>
      </div>

      {/* Dialogs */}
      {showBrowser && <MissionBrowser onClose={handleCloseBrowser} />}

      {showMissionControl && <MissionControlDialog onClose={handleCloseMissionControl} />}

      {showStandaloneOrbit && <StandaloneOrbitDialog onClose={handleCloseStandaloneOrbit} />}

      {showClusterSelection && <ClusterSelectionDialog onClose={handleCloseClusterSelection} />}

      {showSaveResolution && activeMission?.suggestedResolution && (
        <SaveResolutionDialog
          onSave={handleSaveResolution}
          onClose={() => setShowSaveResolution(false)}
        />
      )}

      {showConfirmClearAll && (
        <ConfirmDialog
          title="Clear All Missions"
          message="Are you sure you want to clear all missions? This action cannot be undone."
          confirmText="Clear All"
          cancelText="Cancel"
          onConfirm={handleConfirmClearAll}
          onCancel={() => setShowConfirmClearAll(false)}
          variant="danger"
        />
      )}

      {confirmRollbackMissionId && (
        <ConfirmDialog
          title="Rollback Resolution"
          message="Are you sure you want to rollback the last applied resolution? This will restore the previous file states."
          confirmText="Rollback"
          cancelText="Cancel"
          onConfirm={() => handleConfirmRollback(confirmRollbackMissionId)}
          onCancel={() => setConfirmRollbackMissionId(null)}
          variant="danger"
        />
      )}
    </>
  )
}

// MissionSidebarToggle - unchanged from original
export function MissionSidebarToggle() {
  const { missions } = useMissions()
  const isMobile = useMobile()

  const runningMissions = missions.filter((m) => m.status === 'active' || m.status === 'paused')

  const attentionMissions = missions.filter(
    (m) =>
      m.status === 'completed' ||
      m.status === 'failed' ||
      m.status === 'needs_input' ||
      (m.suggestedResolution && !m.suggestedResolution.applied)
  )

  if (isMobile) {
    return null
  }

  return (
    <button
      onClick={() => {
        const sidebar = document.querySelector('[data-mission-sidebar]') as HTMLElement | null
        if (sidebar) {
          sidebar.click()
        }
      }}
      className="fixed bottom-4 right-4 z-40 bg-primary text-primary-foreground rounded-full p-3 shadow-lg hover:scale-110 transition-transform flex items-center gap-2"
      aria-label="Open mission sidebar"
    >
      <span className="text-sm font-medium">
        {runningMissions.length > 0 ? `${runningMissions.length} running` : 'Missions'}
      </span>
      {attentionMissions.length > 0 && (
        <span className="bg-yellow-500 text-black rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
          {attentionMissions.length}
        </span>
      )}
      <ChevronRight className="w-5 h-5" />
    </button>
  )
}
