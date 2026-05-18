import { useState, useEffect, useRef, useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { useSidebarResize } from './useSidebarResize'
import { isAnyModalOpen } from '../../../lib/modals'
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { useMissions } from '../../../hooks/useMissions'
import { useMobile } from '../../../hooks/useMobile'
import type { Mission } from '../../../hooks/useMissions'
import type { MissionExport, OrbitResourceFilter } from '../../../lib/missions/types'
import { useResolutions, detectIssueSignature, type Resolution } from '../../../hooks/useResolutions'
import { SAVED_TOAST_MS } from '../../../lib/constants/network'
import { MISSION_FILE_FETCH_TIMEOUT_MS } from '../../missions/browser/missionCache'
import { isDemoMode } from '../../../lib/demoMode'
import { ROUTES } from '../../../config/routes'
import {
  BACKGROUND_EXECUTION_STATUSES,
  BACKGROUND_MISSION_PREVIEW_LIMIT,
  MISSION_BROWSER_HISTORY_STATE_KEY,
  MISSION_BROWSER_QUERY_KEY,
  MISSION_BROWSER_QUERY_VALUE,
  MISSION_CHAT_VIEW,
  MISSION_CONTROL_QUERY_KEY,
  MISSION_DEEP_LINK_QUERY_KEY,
  MISSION_IMPORT_QUERY_KEY,
  MISSION_PLAN_QUERY_KEY,
  MISSION_VIEW_QUERY_KEY,
  getMissionAttentionCount,
  matchesMissionSearch,
} from './MissionSidebarConstants'

type MissionsState = ReturnType<typeof useMissions>
type MobileState = ReturnType<typeof useMobile>
type SidebarResizeState = ReturnType<typeof useSidebarResize>
type ResolutionsState = ReturnType<typeof useResolutions>
type OrbitDialogPrefill = { clusters?: string[]; resourceFilters?: Record<string, OrbitResourceFilter[]> } | undefined

type SetBoolean = Dispatch<SetStateAction<boolean>>
type SetNullableString = Dispatch<SetStateAction<string | null>>

export interface MissionSidebarState {
  missions: MissionsState['missions']
  activeMission: MissionsState['activeMission']
  isSidebarOpen: MissionsState['isSidebarOpen']
  isSidebarMinimized: MissionsState['isSidebarMinimized']
  isFullScreen: MissionsState['isFullScreen']
  setActiveMission: MissionsState['setActiveMission']
  closeSidebar: MissionsState['closeSidebar']
  dismissMission: MissionsState['dismissMission']
  cancelMission: MissionsState['cancelMission']
  minimizeSidebar: MissionsState['minimizeSidebar']
  expandSidebar: MissionsState['expandSidebar']
  setFullScreen: MissionsState['setFullScreen']
  selectedAgent: MissionsState['selectedAgent']
  startMission: MissionsState['startMission']
  runSavedMission: MissionsState['runSavedMission']
  isMobile: MobileState['isMobile']
  collapsedMissions: Set<string>
  showAddMenu: boolean
  setShowAddMenu: SetBoolean
  addMenuRef: RefObject<HTMLDivElement | null>
  missionsPageSize: number
  visibleMissionCount: number
  setVisibleMissionCount: Dispatch<SetStateAction<number>>
  sidebarWidth: SidebarResizeState['sidebarWidth']
  isResizing: SidebarResizeState['isResizing']
  isTablet: SidebarResizeState['isTablet']
  handleResizeStart: SidebarResizeState['handleResizeStart']
  showNewMission: boolean
  setShowNewMission: SetBoolean
  showBrowser: boolean
  showMissionControl: boolean
  setShowMissionControl: SetBoolean
  missionControlFreshSessionToken: number | undefined
  setMissionControlFreshSessionToken: Dispatch<SetStateAction<number | undefined>>
  pendingKubaraChart: string | undefined
  setPendingKubaraChart: Dispatch<SetStateAction<string | undefined>>
  pendingReviewPlan: string | undefined
  setPendingReviewPlan: Dispatch<SetStateAction<string | undefined>>
  showOrbitDialog: boolean
  setShowOrbitDialog: SetBoolean
  orbitDialogPrefill: OrbitDialogPrefill
  setOrbitDialogPrefill: Dispatch<SetStateAction<OrbitDialogPrefill>>
  newMissionPrompt: string
  setNewMissionPrompt: Dispatch<SetStateAction<string>>
  showSavedToast: string | null
  setShowSavedToast: SetNullableString
  toastCountdown: number
  setToastCountdown: Dispatch<SetStateAction<number>>
  viewingMission: MissionExport | null
  setViewingMission: Dispatch<SetStateAction<MissionExport | null>>
  viewingMissionRaw: boolean
  setViewingMissionRaw: SetBoolean
  pendingDismissMissionId: string | null
  setPendingDismissMissionId: SetNullableString
  newMissionInputRef: RefObject<HTMLTextAreaElement | null>
  pendingRunMissionId: string | null
  setPendingRunMissionId: SetNullableString
  pendingMission: Mission | null | undefined
  isDirectImporting: boolean
  showSaveResolutionDialog: boolean
  setShowSaveResolutionDialog: SetBoolean
  resolutionPanelView: 'related' | 'history'
  setResolutionPanelView: Dispatch<SetStateAction<'related' | 'history'>>
  relatedResolutions: Resolution[]
  allResolutions: ResolutionsState['allResolutions']
  handleApplyResolution: (resolution: Resolution) => void
  deepLinkMission: string | null
  openMissionBrowser: () => void
  closeMissionBrowser: () => void
  openFreshMissionControl: () => void
  openExistingMissionControl: () => void
  missionSearchQuery: string
  setMissionSearchQuery: Dispatch<SetStateAction<string>>
  showHistoryPanel: boolean
  setShowHistoryPanel: SetBoolean
  lastPanelView: 'dashboard' | 'history'
  setLastPanelView: Dispatch<SetStateAction<'dashboard' | 'history'>>
  toggleHistoryPanel: () => void
  savedMissions: Mission[]
  activeMissions: Mission[]
  visibleActiveMissions: Mission[]
  hasMoreMissions: boolean
  listTotalMissions: number
  handleImportMission: (mission: MissionExport) => void
  handleViewSavedMission: (mission: Mission) => void
  handleRunMission: (missionId: string) => void
  needsAttention: number
  runningMissions: Mission[]
  runningMissionPreview: Mission[]
  runningCount: number
  toggleMissionCollapse: (missionId: string) => void
  handleRollback: (mission: Mission) => void
  shouldRenderMinimizedSidebar: boolean
  shouldRenderExpandedSidebar: boolean
}

export function useMissionSidebarState(): MissionSidebarState {
  const { missions, activeMission, isSidebarOpen, isSidebarMinimized, isFullScreen, setActiveMission, closeSidebar, dismissMission, cancelMission, minimizeSidebar, expandSidebar, setFullScreen, selectedAgent, startMission, saveMission, runSavedMission, openSidebar, sendMessage } = useMissions()
  const { isMobile } = useMobile()
  const [collapsedMissions, setCollapsedMissions] = useState<Set<string>>(new Set())
  const [showAddMenu, setShowAddMenu] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showAddMenu) return
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAddMenu])

  /** Number of missions rendered per page in the history list (#4778) */
  const MISSIONS_PAGE_SIZE = 20
  const [visibleMissionCount, setVisibleMissionCount] = useState(MISSIONS_PAGE_SIZE)

  // Resizable sidebar width (desktop non-fullscreen only)
  const { sidebarWidth, isResizing, isTablet, handleResizeStart } = useSidebarResize()

  // Track tablet range (>= mobile but < lg). In this range the sidebar is
  // rendered as an overlay that does NOT push main content — pushing at
  // tablet widths squeezes main below the sidebar min width and can cause
  // ~10px content overlap (issue 6388).

  // Publish sidebar width as a CSS custom property so Layout.tsx can
  // adjust main-content margins without needing context plumbing.
  // On tablet (< 1024px) we publish 0 so the sidebar floats as an overlay.
  useEffect(() => {
    const root = document.documentElement
    const isOverlayMode = isMobile || isTablet
    if (!isOverlayMode && isSidebarOpen && !isSidebarMinimized && !isFullScreen) {
      root.style.setProperty('--mission-sidebar-width', `${sidebarWidth}px`)
    } else if (!isOverlayMode && isSidebarOpen && isSidebarMinimized && !isFullScreen) {
      root.style.setProperty('--mission-sidebar-width', '48px')
    } else {
      root.style.setProperty('--mission-sidebar-width', '0px')
    }
    return () => { root.style.removeProperty('--mission-sidebar-width') }
  }, [isMobile, isTablet, isSidebarOpen, isSidebarMinimized, isFullScreen, sidebarWidth])

  const [showNewMission, setShowNewMission] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [showMissionControl, setShowMissionControl] = useState(false)
  /** Increments when sidebar CTAs should force a brand-new Mission Control session. */
  const [missionControlFreshSessionToken, setMissionControlFreshSessionToken] = useState<number | undefined>(undefined)
  /** Kubara chart name to pre-populate in Mission Control Phase 1 (#8483) */
  const [pendingKubaraChart, setPendingKubaraChart] = useState<string | undefined>(undefined)
  /** Base64-encoded plan from a deep link — opens Mission Control in review mode */
  const [pendingReviewPlan, setPendingReviewPlan] = useState<string | undefined>(undefined)
  const [showOrbitDialog, setShowOrbitDialog] = useState(false)
  const [orbitDialogPrefill, setOrbitDialogPrefill] = useState<OrbitDialogPrefill>(undefined)
  const [newMissionPrompt, setNewMissionPrompt] = useState('')
  const [showSavedToast, setShowSavedToast] = useState<string | null>(null)
  /** Countdown seconds remaining for the saved-mission toast */
  const [toastCountdown, setToastCountdown] = useState(0)
  const [viewingMission, setViewingMission] = useState<MissionExport | null>(null)
  const [viewingMissionRaw, setViewingMissionRaw] = useState(false)
  const [pendingDismissMissionId, setPendingDismissMissionId] = useState<string | null>(null)
  const newMissionInputRef = useRef<HTMLTextAreaElement>(null)
  /** Ref to track the first-import toast countdown interval so it can be cleared on unmount or re-import */
  const toastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Cluster selection for install missions
  const [pendingRunMissionId, setPendingRunMissionId] = useState<string | null>(null)
  const [isDirectImporting, setIsDirectImporting] = useState(false)
  // Save Resolution dialog state (triggered from ResolutionKnowledgePanel "Save This Resolution" button)
  const [showSaveResolutionDialog, setShowSaveResolutionDialog] = useState(false)
  // Reset dialog when active mission changes to prevent stale dialog for a different mission
  useEffect(() => { setShowSaveResolutionDialog(false) }, [activeMission?.id])
  // Clean up first-import toast interval on unmount to prevent timer leak (#5211)
  useEffect(() => {
    return () => {
      if (toastIntervalRef.current) {
        clearInterval(toastIntervalRef.current)
        toastIntervalRef.current = null
      }
    }
  }, [])
  // Resolution panel state (fullscreen left sidebar)
  const [resolutionPanelView, setResolutionPanelView] = useState<'related' | 'history'>('related')
  const { findSimilarResolutions, allResolutions } = useResolutions()
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

  const handleApplyResolution = (resolution: Resolution) => {
    if (!activeMission) return
    const NON_APPLIABLE_STATUSES = new Set(['blocked', 'pending', 'cancelling', 'running'])
    if (NON_APPLIABLE_STATUSES.has(activeMission.status)) {
      return
    }
    const stepsText = (resolution.resolution.steps || []).length > 0
      ? `\n\nSteps:\n${(resolution.resolution.steps || []).map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`
      : ''
    const applyMessage = `Please apply this saved resolution:\n\n**${resolution.title}**\n\n${resolution.resolution.summary}${stepsText}${resolution.resolution.yaml ? `\n\nYAML:\n\`\`\`yaml\n${resolution.resolution.yaml}\n\`\`\`` : ''}`
    sendMessage(activeMission.id, applyMessage)
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const browserHistoryEntryRef = useRef(false)
  const deepLinkMission = searchParams.get(MISSION_DEEP_LINK_QUERY_KEY)
  const missionViewParam = searchParams.get(MISSION_VIEW_QUERY_KEY)
  const directImportSlug = searchParams.get(MISSION_IMPORT_QUERY_KEY)
  const browseParam = searchParams.get(MISSION_BROWSER_QUERY_KEY)
  const missionControlParam = searchParams.get(MISSION_CONTROL_QUERY_KEY)
  const isMissionBrowserRoute = location.pathname === ROUTES.MISSIONS
  const isMissionChatView = missionViewParam === MISSION_CHAT_VIEW
  const fullScreenMissionFromUrl = isMissionChatView && deepLinkMission
    ? missions.find(mission => mission.id === deepLinkMission) || null
    : null
  const isMissionBrowserDeepLink = !isMissionChatView && (Boolean(deepLinkMission) || browseParam === MISSION_BROWSER_QUERY_VALUE || isMissionBrowserRoute)
  const prefetchedMission = (location.state as { prefetchedMission?: MissionExport } | null)?.prefetchedMission

  const getMissionBrowserSearchParams = () => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete(MISSION_DEEP_LINK_QUERY_KEY)
    nextParams.delete(MISSION_BROWSER_QUERY_KEY)
    return nextParams
  }

  const openMissionBrowser = () => {
    if (typeof window !== 'undefined' && !isMissionBrowserDeepLink && !browserHistoryEntryRef.current) {
      const currentState = window.history.state
      const nextState = currentState && typeof currentState === 'object'
        ? { ...(currentState as Record<string, unknown>), [MISSION_BROWSER_HISTORY_STATE_KEY]: true }
        : { [MISSION_BROWSER_HISTORY_STATE_KEY]: true }
      window.history.pushState(nextState, '', window.location.href)
      browserHistoryEntryRef.current = true
    }
    setShowBrowser(true)
  }

  const closeMissionBrowser = () => {
    if (isMissionBrowserRoute) {
      const nextParams = getMissionBrowserSearchParams()
      const nextSearch = nextParams.toString()
      setShowBrowser(false)
      navigate({ pathname: ROUTES.HOME, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
      return
    }
    if (isMissionBrowserDeepLink) {
      setShowBrowser(false)
      setSearchParams(getMissionBrowserSearchParams(), { replace: true })
      return
    }
    if (browserHistoryEntryRef.current && typeof window !== 'undefined') {
      window.history.back()
      return
    }
    setShowBrowser(false)
  }

  const openFreshMissionControl = useCallback(() => {
    setPendingKubaraChart(undefined)
    setPendingReviewPlan(undefined)
    setMissionControlFreshSessionToken((prev) => (prev ?? 0) + 1)
    setShowMissionControl(true)
  }, [])

  const openExistingMissionControl = useCallback(() => {
    setPendingKubaraChart(undefined)
    setPendingReviewPlan(undefined)
    setMissionControlFreshSessionToken(undefined)
    setShowMissionControl(true)
  }, [])

  useEffect(() => {
    if (isMissionBrowserDeepLink) {
      setShowBrowser(true)
    }
  }, [isMissionBrowserDeepLink])

  useEffect(() => {
    if (!isMissionChatView) return

    if (!fullScreenMissionFromUrl) {
      if (deepLinkMission) {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete(MISSION_DEEP_LINK_QUERY_KEY)
        nextParams.delete(MISSION_VIEW_QUERY_KEY)
        setSearchParams(nextParams, { replace: true })
      }
      return
    }

    setActiveMission(fullScreenMissionFromUrl.id)
    openSidebar()
    setFullScreen(true)
  }, [
    deepLinkMission,
    fullScreenMissionFromUrl,
    isMissionChatView,
    openSidebar,
    searchParams,
    setActiveMission,
    setFullScreen,
    setSearchParams,
  ])

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams)

    if (isFullScreen && activeMission) {
      nextParams.set(MISSION_DEEP_LINK_QUERY_KEY, activeMission.id)
      nextParams.set(MISSION_VIEW_QUERY_KEY, MISSION_CHAT_VIEW)
    } else if (searchParams.get(MISSION_VIEW_QUERY_KEY) === MISSION_CHAT_VIEW) {
      nextParams.delete(MISSION_VIEW_QUERY_KEY)
      if (!activeMission || searchParams.get(MISSION_DEEP_LINK_QUERY_KEY) === activeMission.id) {
        nextParams.delete(MISSION_DEEP_LINK_QUERY_KEY)
      }
    } else {
      return
    }

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [activeMission, isFullScreen, searchParams, setSearchParams])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      if (!showBrowser) return
      browserHistoryEntryRef.current = false
      setShowBrowser(false)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [showBrowser])

  useEffect(() => {
    if (missionControlParam === 'open') {
      openFreshMissionControl()
      const newParams = new URLSearchParams(searchParams)
      newParams.delete(MISSION_CONTROL_QUERY_KEY)
      setSearchParams(newParams, { replace: true })
    } else if (missionControlParam === 'review') {
      const planParam = searchParams.get(MISSION_PLAN_QUERY_KEY)
      if (planParam) {
        setPendingKubaraChart(undefined)
        setPendingReviewPlan(planParam)
        setMissionControlFreshSessionToken(undefined)
        setShowMissionControl(true)
      }
      const newParams = new URLSearchParams(searchParams)
      newParams.delete(MISSION_CONTROL_QUERY_KEY)
      newParams.delete(MISSION_PLAN_QUERY_KEY)
      setSearchParams(newParams, { replace: true })
    }
  }, [missionControlParam, openFreshMissionControl, searchParams, setSearchParams])

  useEffect(() => {
    if (!directImportSlug) return

    const newParams = new URLSearchParams(searchParams)
    newParams.delete(MISSION_IMPORT_QUERY_KEY)
    setSearchParams(newParams, { replace: true })

    if (prefetchedMission) {
      handleImportMission(prefetchedMission)
      window.history.replaceState({}, '')
      return
    }

    const KB_DIRS = [
      'cncf-install', 'cncf-generated', 'security', 'platform-install',
      'llm-d', 'multi-cluster', 'troubleshoot', 'troubleshooting',
      'cost-optimization', 'networking', 'observability', 'workloads',
    ]
    const paths = [
      ...KB_DIRS.map(dir => `fixes/${dir}/${directImportSlug}.json`),
      `fixes/${directImportSlug}.json`,
    ]

    const tryImport = async () => {
      setIsDirectImporting(true)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), MISSION_FILE_FETCH_TIMEOUT_MS)
      let found: MissionExport | null = null
      try {
        found = await Promise.any(paths.map(async (path) => {
          const res = await fetch(`/api/missions/file?path=${encodeURIComponent(path)}`, {
            signal: controller.signal })
          if (!res.ok) throw new Error('not found')
          const raw = await res.text()
          const parsed = JSON.parse(raw)
          const { validateMissionExport } = await import('../../../lib/missions/types')
          const result = validateMissionExport(parsed)
          if (!result.valid) throw new Error('invalid')
          controller.abort()
          return result.data
        }))
      } catch {
        found = null
      } finally {
        clearTimeout(timeout)
      }
      if (found) {
        handleImportMission(found)
        return
      }

      try {
        const res = await fetch('/api/missions/file?path=fixes/index.json', {
          signal: AbortSignal.timeout(MISSION_FILE_FETCH_TIMEOUT_MS) })
        if (res.ok) {
          const index = await res.json() as { missions?: Array<{ path: string }> }
          const match = (index.missions || []).find(m => {
            const filename = (m.path || '').split('/').pop() || ''
            return filename.replace('.json', '') === directImportSlug
          })
          if (match) {
            const fileRes = await fetch(`/api/missions/file?path=${encodeURIComponent(match.path)}`, {
              signal: AbortSignal.timeout(MISSION_FILE_FETCH_TIMEOUT_MS) })
            if (fileRes.ok) {
              const raw = await fileRes.text()
              const parsed = JSON.parse(raw)
              const { validateMissionExport } = await import('../../../lib/missions/types')
              const result = validateMissionExport(parsed)
              if (result.valid) {
                handleImportMission(result.data)
                return
              }
            }
          }
        }
      } catch {
      }

      openMissionBrowser()
    }

    tryImport().finally(() => setIsDirectImporting(false))
  }, [directImportSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  const [missionSearchQuery, setMissionSearchQuery] = useState('')

  const HISTORY_PANEL_KEY = 'ksc-mission-history-panel'
  const [showHistoryPanel, setShowHistoryPanel] = useState(() => {
    try {
      return localStorage.getItem(HISTORY_PANEL_KEY) === 'true'
    } catch { return false }
  })
  const [lastPanelView, setLastPanelView] = useState<'dashboard' | 'history'>(
    showHistoryPanel ? 'history' : 'dashboard'
  )

  const toggleHistoryPanel = () => {
    setShowHistoryPanel(prev => {
      const next = !prev
      try { localStorage.setItem(HISTORY_PANEL_KEY, String(next)) } catch { }
      if (!next) setMissionSearchQuery('')
      return next
    })
  }

  useEffect(() => {
    setVisibleMissionCount(MISSIONS_PAGE_SIZE)
  }, [missionSearchQuery])

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

  const handleImportMission = (mission: MissionExport) => {
    const missionType = mission.missionClass === 'install' ? 'deploy' as const
      : mission.type === 'troubleshoot' ? 'troubleshoot' as const
      : mission.type === 'deploy' ? 'deploy' as const
      : mission.type === 'upgrade' ? 'upgrade' as const
      : 'custom' as const
    const missionId = saveMission({
      type: missionType,
      title: mission.title,
      description: mission.description || mission.title,
      missionClass: mission.missionClass,
      cncfProject: mission.cncfProject,
      steps: mission.steps?.map(s => ({ title: s.title, description: s.description })),
      tags: mission.tags,
      initialPrompt: mission.resolution?.summary || mission.description })
    openSidebar()
    setActiveMission(missionId)

    const hasImportedBefore = localStorage.getItem('ksc-has-imported')
    if (!hasImportedBefore) {
      localStorage.setItem('ksc-has-imported', new Date().toISOString())
      setShowSavedToast(mission.title)
      const FIRST_IMPORT_COUNTDOWN_S = 60
      setToastCountdown(FIRST_IMPORT_COUNTDOWN_S)
      if (toastIntervalRef.current) {
        clearInterval(toastIntervalRef.current)
      }
      toastIntervalRef.current = setInterval(() => {
        setToastCountdown((prev) => {
          if (prev <= 1) {
            if (toastIntervalRef.current) {
              clearInterval(toastIntervalRef.current)
              toastIntervalRef.current = null
            }
            setShowSavedToast(null)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      setShowSavedToast(mission.title)
      setTimeout(() => setShowSavedToast(null), SAVED_TOAST_MS)
    }
  }

  const savedMissionToExport = useCallback((m: Mission): MissionExport => ({
    version: '1.0',
    title: m.importedFrom?.title || m.title,
    description: m.importedFrom?.description || m.description,
    type: m.type,
    tags: m.importedFrom?.tags || [],
    missionClass: m.importedFrom?.missionClass as MissionExport['missionClass'],
    cncfProject: m.importedFrom?.cncfProject,
    steps: (m.importedFrom?.steps || []).map(s => ({
      title: s.title,
      description: s.description })) }), [])

  const handleViewSavedMission = useCallback((m: Mission) => {
    setViewingMission(savedMissionToExport(m))
    setViewingMissionRaw(false)
  }, [savedMissionToExport])

  const handleRunMission = useCallback((missionId: string) => {
    if (isDemoMode()) {
      window.dispatchEvent(new CustomEvent('open-install'))
      return
    }
    const mission = (missions || []).find(m => m.id === missionId)
    const isInstall = mission?.importedFrom?.missionClass === 'install' || mission?.type === 'deploy'
    if (isInstall) {
      setPendingRunMissionId(missionId)
    } else {
      runSavedMission(missionId)
    }
  }, [missions, runSavedMission])

  const pendingMission = pendingRunMissionId ? missions.find(m => m.id === pendingRunMissionId) : null

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showBrowser || showMissionControl) return
      if (isAnyModalOpen()) return
      if (isFullScreen) {
        setFullScreen(false)
      } else if (isSidebarOpen) {
        closeSidebar()
      }
    }
    if (isSidebarOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isSidebarOpen, isFullScreen, showBrowser, showMissionControl, setFullScreen, closeSidebar])

  const needsAttention = getMissionAttentionCount(missions)

  const runningMissions = missions
    .filter(mission => BACKGROUND_EXECUTION_STATUSES.has(mission.status))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  const runningMissionPreview = runningMissions.slice(0, BACKGROUND_MISSION_PREVIEW_LIMIT)
  const runningCount = missions.filter(m => m.status === 'running').length

  useEffect(() => {
    if (needsAttention > 0 && !showHistoryPanel && !activeMission) {
      setShowHistoryPanel(true)
    }
  }, [needsAttention]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleRollback = (mission: Mission) => {
    const agentMessages = (mission.messages || [])
      .filter(m => m.role === 'assistant' && m.content)
      .map(m => m.content)
      .join('\n')

    const rollbackPrompt = [
      `The following AI mission was interrupted or failed and may have left the cluster in an inconsistent state.`,
      `Original mission: "${mission.title}"`,
      mission.cluster ? `Cluster: ${mission.cluster}` : '',
      `Status: ${mission.status}`,
      ``,
      `Here is a summary of what the mission attempted:`,
      agentMessages.slice(0, 2000),
      ``,
      `Please analyze what changes were likely applied and reverse them safely.`,
      `Check the current state of the cluster first, identify any partially-applied changes,`,
      `and roll them back. Ask me before making destructive changes.`,
    ].filter(Boolean).join('\n')

    startMission({
      title: `Rollback: ${mission.title}`,
      description: `Reverse changes from interrupted mission "${mission.title}"`,
      type: 'repair',
      cluster: mission.cluster,
      initialPrompt: rollbackPrompt,
    })
    openSidebar()
  }

  const shouldRenderMinimizedSidebar = isSidebarOpen && isSidebarMinimized && !isMobile
  const shouldRenderExpandedSidebar = isSidebarOpen && !isSidebarMinimized

  return {
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
    runSavedMission,
    isMobile,
    collapsedMissions,
    showAddMenu,
    setShowAddMenu,
    addMenuRef,
    missionsPageSize: MISSIONS_PAGE_SIZE,
    visibleMissionCount,
    setVisibleMissionCount,
    sidebarWidth,
    isResizing,
    isTablet,
    handleResizeStart,
    showNewMission,
    setShowNewMission,
    showBrowser,
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
    newMissionInputRef,
    pendingRunMissionId,
    setPendingRunMissionId,
    pendingMission,
    isDirectImporting,
    showSaveResolutionDialog,
    setShowSaveResolutionDialog,
    resolutionPanelView,
    setResolutionPanelView,
    relatedResolutions,
    allResolutions,
    handleApplyResolution,
    deepLinkMission,
    openMissionBrowser,
    closeMissionBrowser,
    openFreshMissionControl,
    openExistingMissionControl,
    missionSearchQuery,
    setMissionSearchQuery,
    showHistoryPanel,
    setShowHistoryPanel,
    lastPanelView,
    setLastPanelView,
    toggleHistoryPanel,
    savedMissions,
    activeMissions,
    visibleActiveMissions,
    hasMoreMissions,
    listTotalMissions,
    handleImportMission,
    handleViewSavedMission,
    handleRunMission,
    needsAttention,
    runningMissions,
    runningMissionPreview,
    runningCount,
    toggleMissionCollapse,
    handleRollback,
    shouldRenderMinimizedSidebar,
    shouldRenderExpandedSidebar,
  }
}
