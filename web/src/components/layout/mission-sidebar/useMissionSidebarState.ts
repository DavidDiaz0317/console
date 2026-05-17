import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { useMissions, isActiveMission, type Mission } from '../../../hooks/useMissions'
import { useResolutions, detectIssueSignature, type Resolution } from '../../../hooks/useResolutions'
import type { MissionExport, OrbitResourceFilter } from '../../../lib/missions/types'
import {
  MISSIONS_PAGE_SIZE,
  HISTORY_PANEL_KEY,
  matchesMissionSearch,
  getMissionAttentionCount,
  BACKGROUND_EXECUTION_STATUSES,
  BACKGROUND_MISSION_PREVIEW_LIMIT,
  MISSION_BROWSER_QUERY_KEY,
  MISSION_BROWSER_QUERY_VALUE,
  MISSION_DEEP_LINK_QUERY_KEY,
  MISSION_VIEW_QUERY_KEY,
  MISSION_CHAT_VIEW,
  MISSION_BROWSER_HISTORY_STATE_KEY,
} from './missionSidebarConstants'
import { ROUTES } from '../../../config/routes'
import { SAVED_TOAST_MS } from '../../../lib/constants/network'

export function useMissionSidebarState() {
  const {
    missions,
    activeMission,
    isSidebarOpen,
    isSidebarMinimized,
    isFullScreen,
    setActiveMission,
    closeSidebar,
    dismissMission,
    cancelMission,
    minimizeSidebar,
    expandSidebar,
    setFullScreen,
    selectedAgent,
    startMission,
    saveMission,
    runSavedMission,
    openSidebar,
    sendMessage,
  } = useMissions()

  const [collapsedMissions, setCollapsedMissions] = useState<Set<string>>(new Set())
  const [visibleMissionCount, setVisibleMissionCount] = useState(MISSIONS_PAGE_SIZE)
  const [showNewMission, setShowNewMission] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [showMissionControl, setShowMissionControl] = useState(false)
  const [missionControlFreshSessionToken, setMissionControlFreshSessionToken] = useState<number | undefined>(undefined)
  const [pendingKubaraChart, setPendingKubaraChart] = useState<string | undefined>(undefined)
  const [pendingReviewPlan, setPendingReviewPlan] = useState<string | undefined>(undefined)
  const [showOrbitDialog, setShowOrbitDialog] = useState(false)
  const [orbitDialogPrefill, setOrbitDialogPrefill] = useState<{ clusters?: string[]; resourceFilters?: Record<string, OrbitResourceFilter[]> } | undefined>(undefined)
  const [newMissionPrompt, setNewMissionPrompt] = useState('')
  const [showSavedToast, setShowSavedToast] = useState<string | null>(null)
  const [toastCountdown, setToastCountdown] = useState(0)
  const [viewingMission, setViewingMission] = useState<MissionExport | null>(null)
  const [viewingMissionRaw, setViewingMissionRaw] = useState(false)
  const [pendingDismissMissionId, setPendingDismissMissionId] = useState<string | null>(null)
  const [pendingRunMissionId, setPendingRunMissionId] = useState<string | null>(null)
  const [isDirectImporting, setIsDirectImporting] = useState(false)
  const [showSaveResolutionDialog, setShowSaveResolutionDialog] = useState(false)
  const [resolutionPanelView, setResolutionPanelView] = useState<'related' | 'history'>('related')
  const [missionSearchQuery, setMissionSearchQuery] = useState('')
  const [showHistoryPanel, setShowHistoryPanel] = useState(() => {
    try {
      return localStorage.getItem(HISTORY_PANEL_KEY) === 'true'
    } catch { return false }
  })
  const [lastPanelView, setLastPanelView] = useState<'dashboard' | 'history'>(
    showHistoryPanel ? 'history' : 'dashboard'
  )

  const newMissionInputRef = useRef<HTMLTextAreaElement>(null)
  const toastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const browserHistoryEntryRef = useRef(false)

  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  const { findSimilarResolutions, allResolutions } = useResolutions()

  // Reset save resolution dialog when active mission changes
  useEffect(() => { setShowSaveResolutionDialog(false) }, [activeMission?.id])

  // Clean up toast interval on unmount
  useEffect(() => {
    return () => {
      if (toastIntervalRef.current) {
        clearInterval(toastIntervalRef.current)
        toastIntervalRef.current = null
      }
    }
  }, [])

  // Reset pagination when search query changes
  useEffect(() => {
    setVisibleMissionCount(MISSIONS_PAGE_SIZE)
  }, [missionSearchQuery])

  // Toggle history panel
  const toggleHistoryPanel = () => {
    setShowHistoryPanel(prev => {
      const next = !prev
      try { localStorage.setItem(HISTORY_PANEL_KEY, String(next)) } catch { /* ignore */ }
      if (!next) setMissionSearchQuery('')
      return next
    })
  }

  // Toggle mission collapse
  const toggleMissionCollapse = (missionId: string) => {
    setCollapsedMissions(prev => {
      const next = new Set(prev)
      if (next.has(missionId)) {
        next.delete(missionId)
      } else {
        next.add(missionId)
      }
      return next
    })
  }

  // Split missions into saved and active
  const normalizedMissionSearchQuery = missionSearchQuery.trim().toLowerCase()
  const savedMissions = useMemo(
    () => (missions || []).filter(m => m.status === 'saved' && matchesMissionSearch(m, normalizedMissionSearchQuery)),
    [missions, normalizedMissionSearchQuery]
  )
  const activeMissions = useMemo(
    () => (missions || [])
      .filter(m => m.status !== 'saved' && matchesMissionSearch(m, normalizedMissionSearchQuery))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [missions, normalizedMissionSearchQuery]
  )

  const visibleActiveMissions = activeMissions.slice(0, visibleMissionCount)
  const hasMoreMissions = activeMissions.length > visibleMissionCount
  const listTotalMissions = savedMissions.length + activeMissions.length
  const needsAttention = getMissionAttentionCount(missions)

  const runningMissions = missions
    .filter(mission => BACKGROUND_EXECUTION_STATUSES.has(mission.status))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  const runningMissionPreview = runningMissions.slice(0, BACKGROUND_MISSION_PREVIEW_LIMIT)
  const runningCount = missions.filter(m => m.status === 'running').length

  // Related resolutions
  const relatedResolutions = (() => {
    if (!activeMission) return []
    const content = [
      activeMission.title,
      activeMission.description,
      ...(activeMission.messages || []).slice(0, 3).map(m => m.content),
    ].join('\n')
    const signature = detectIssueSignature(content)
    if (!signature.type || signature.type === 'Unknown') return []
    return findSimilarResolutions(signature as { type: string }, { minSimilarity: 0.4, limit: 5 })
  })()

  // Auto-open history when missions need attention
  useEffect(() => {
    if (needsAttention > 0 && !showHistoryPanel && !activeMission) {
      setShowHistoryPanel(true)
    }
  }, [needsAttention]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Mission context
    missions,
    activeMission,
    isSidebarOpen,
    isSidebarMinimized,
    isFullScreen,
    setActiveMission,
    closeSidebar,
    dismissMission,
    cancelMission,
    minimizeSidebar,
    expandSidebar,
    setFullScreen,
    selectedAgent,
    startMission,
    saveMission,
    runSavedMission,
    openSidebar,
    sendMessage,

    // Local state
    collapsedMissions,
    toggleMissionCollapse,
    visibleMissionCount,
    setVisibleMissionCount,
    showNewMission,
    setShowNewMission,
    showBrowser,
    setShowBrowser,
    showMissionControl,
    setShowMissionControl,
    missionControlFreshSessionToken,
    setMissionControlFreshSessionToken,
    pendingKubaraChart,
    setPendingKubaraChart,
    pendingReviewPlan,
    setPendingReviewPlan,
    showOrbitDialog,
    setShowOrbitDialog,
    orbitDialogPrefill,
    setOrbitDialogPrefill,
    newMissionPrompt,
    setNewMissionPrompt,
    showSavedToast,
    setShowSavedToast,
    toastCountdown,
    setToastCountdown,
    viewingMission,
    setViewingMission,
    viewingMissionRaw,
    setViewingMissionRaw,
    pendingDismissMissionId,
    setPendingDismissMissionId,
    pendingRunMissionId,
    setPendingRunMissionId,
    isDirectImporting,
    setIsDirectImporting,
    showSaveResolutionDialog,
    setShowSaveResolutionDialog,
    resolutionPanelView,
    setResolutionPanelView,
    missionSearchQuery,
    setMissionSearchQuery,
    showHistoryPanel,
    setShowHistoryPanel,
    toggleHistoryPanel,
    lastPanelView,
    setLastPanelView,

    // Refs
    newMissionInputRef,
    toastIntervalRef,
    browserHistoryEntryRef,

    // Router
    searchParams,
    setSearchParams,
    location,
    navigate,

    // Resolutions
    findSimilarResolutions,
    allResolutions,
    relatedResolutions,

    // Computed values
    normalizedMissionSearchQuery,
    savedMissions,
    activeMissions,
    visibleActiveMissions,
    hasMoreMissions,
    listTotalMissions,
    needsAttention,
    runningMissions,
    runningMissionPreview,
    runningCount,
  }
}
