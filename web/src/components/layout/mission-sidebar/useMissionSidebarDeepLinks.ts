import { useState, useEffect, useCallback, type RefObject } from 'react'
import { useSearchParams, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom'
import type { Mission } from '../../../hooks/useMissions'
import type { MissionExport } from '../../../lib/missions/types'
import {
  MISSION_BROWSER_QUERY_KEY,
  MISSION_BROWSER_QUERY_VALUE,
  MISSION_DEEP_LINK_QUERY_KEY,
  MISSION_VIEW_QUERY_KEY,
  MISSION_CHAT_VIEW,
  MISSION_IMPORT_QUERY_KEY,
  MISSION_CONTROL_QUERY_KEY,
  MISSION_PLAN_QUERY_KEY,
  MISSION_BROWSER_HISTORY_STATE_KEY,
} from './missionSidebarConstants'
import { ROUTES } from '../../../config/routes'
import { MISSION_FILE_FETCH_TIMEOUT_MS } from '../../missions/browser/missionCache'

export function useMissionBrowserDeepLink(
  showBrowser: boolean,
  setShowBrowser: (show: boolean) => void,
  browserHistoryEntryRef: RefObject<boolean>,
  missions: Mission[],
  setActiveMission: (id: string | null) => void,
  openSidebar: () => void,
  setFullScreen: (full: boolean) => void
) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  const deepLinkMission = searchParams.get(MISSION_DEEP_LINK_QUERY_KEY)
  const missionViewParam = searchParams.get(MISSION_VIEW_QUERY_KEY)
  const browseParam = searchParams.get(MISSION_BROWSER_QUERY_KEY)
  const isMissionBrowserRoute = location.pathname === ROUTES.MISSIONS
  const isMissionChatView = missionViewParam === MISSION_CHAT_VIEW
  const fullScreenMissionFromUrl = isMissionChatView && deepLinkMission
    ? missions.find(mission => mission.id === deepLinkMission) || null
    : null
  const isMissionBrowserDeepLink = !isMissionChatView && (Boolean(deepLinkMission) || browseParam === MISSION_BROWSER_QUERY_VALUE || isMissionBrowserRoute)

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

  // Open browser on deep link
  useEffect(() => {
    if (isMissionBrowserDeepLink) {
      setShowBrowser(true)
    }
  }, [isMissionBrowserDeepLink, setShowBrowser])

  // Hydrate fullscreen chat from URL
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

  // Sync URL with fullscreen state
  useEffect(() => {
    const activeMission = missions.find(m => m.id === deepLinkMission)
    const nextParams = new URLSearchParams(searchParams)
    const isFullScreen = fullScreenMissionFromUrl !== null

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
  }, [fullScreenMissionFromUrl, missions, deepLinkMission, searchParams, setSearchParams])

  // Handle browser back button
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      if (!showBrowser) return
      browserHistoryEntryRef.current = false
      setShowBrowser(false)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [showBrowser, setShowBrowser])

  return {
    openMissionBrowser,
    closeMissionBrowser,
    deepLinkMission,
    isMissionBrowserDeepLink,
  }
}

export function useMissionControlDeepLink(
  searchParams: URLSearchParams,
  setSearchParams: (params: URLSearchParams, options?: { replace?: boolean }) => void,
  openFreshMissionControl: () => void,
  setPendingKubaraChart: (chart: string | undefined) => void,
  setPendingReviewPlan: (plan: string | undefined) => void,
  setMissionControlFreshSessionToken: (token: number | undefined) => void,
  setShowMissionControl: (show: boolean) => void
) {
  const missionControlParam = searchParams.get(MISSION_CONTROL_QUERY_KEY)

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
  }, [
    missionControlParam,
    openFreshMissionControl,
    searchParams,
    setSearchParams,
    setPendingKubaraChart,
    setPendingReviewPlan,
    setMissionControlFreshSessionToken,
    setShowMissionControl,
  ])
}

export function useDirectImport(
  directImportSlug: string | null,
  searchParams: URLSearchParams,
  setSearchParams: (params: URLSearchParams, options?: { replace?: boolean }) => void,
  prefetchedMission: MissionExport | undefined,
  setIsDirectImporting: (importing: boolean) => void,
  handleImportMission: (mission: MissionExport) => void,
  openMissionBrowser: () => void
) {
  useEffect(() => {
    if (!directImportSlug) return

    // Clear the param immediately to prevent re-triggering
    const newParams = new URLSearchParams(searchParams)
    newParams.delete(MISSION_IMPORT_QUERY_KEY)
    setSearchParams(newParams, { replace: true })

    // Fast path: use prefetched mission if available
    if (prefetchedMission) {
      handleImportMission(prefetchedMission)
      window.history.replaceState({}, '')
      return
    }

    // Slow path: fetch mission by racing all known directories
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
      }
      if (found) {
        handleImportMission(found)
        return
      }

      // Fallback: search index.json
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
        // Index fallback failed
      }

      // Last resort: open the browser
      openMissionBrowser()
    }

    tryImport().finally(() => setIsDirectImporting(false))
  }, [directImportSlug]) // eslint-disable-line react-hooks/exhaustive-deps
}
