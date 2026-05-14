import { useMemo, useSyncExternalStore } from 'react'
import type { Location } from 'react-router-dom'
import { useNavigationType, UNSAFE_LocationContext } from 'react-router-dom'
import { ROUTES } from '@/config/routes'

const LIVE_LOCATION_EVENT = 'kc:locationchange'
const HISTORY_PATCHED_FLAG = '__kcHistoryPatched__'
const getLiveUrl = () => `${window.location.pathname}${window.location.search}${window.location.hash}`

type PatchedHistory = History & {
  [HISTORY_PATCHED_FLAG]?: boolean
}

function installLocationChangeBridge() {
  if (typeof window === 'undefined') return () => {}
  const historyWithFlag = window.history as PatchedHistory
  if (historyWithFlag[HISTORY_PATCHED_FLAG]) return () => {}

  const originalPushState = window.history.pushState
  const originalReplaceState = window.history.replaceState
  const notifyLocationChange = () => {
    window.dispatchEvent(new Event(LIVE_LOCATION_EVENT))
  }
  const wrapHistoryMethod = (method: 'pushState' | 'replaceState') => {
    const original = method === 'pushState' ? originalPushState : originalReplaceState
    window.history[method] = function (...args: Parameters<History[typeof method]>) {
      const result = original.apply(this, args)
      notifyLocationChange()
      return result
    }
  }

  wrapHistoryMethod('pushState')
  wrapHistoryMethod('replaceState')
  window.addEventListener('popstate', notifyLocationChange)
  window.addEventListener('hashchange', notifyLocationChange)
  historyWithFlag[HISTORY_PATCHED_FLAG] = true

  return () => {
    window.removeEventListener('popstate', notifyLocationChange)
    window.removeEventListener('hashchange', notifyLocationChange)
    window.history.pushState = originalPushState
    window.history.replaceState = originalReplaceState
    historyWithFlag[HISTORY_PATCHED_FLAG] = false
  }
}

if (typeof window !== 'undefined') {
  const removeLocationChangeBridge = installLocationChangeBridge()
  if (import.meta.hot) {
    import.meta.hot.dispose(removeLocationChangeBridge)
  }
}

export function useLiveUrl(): string {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener(LIVE_LOCATION_EVENT, notify)
      return () => {
        window.removeEventListener(LIVE_LOCATION_EVENT, notify)
      }
    },
    getLiveUrl,
    () => ROUTES.HOME,
  )
}

export function LiveLocationProvider({
  location,
  navigationType,
  children,
}: {
  location: Location
  navigationType: ReturnType<typeof useNavigationType>
  children: React.ReactNode
}) {
  const contextValue = useMemo(
    () => ({ location, navigationType }),
    [location, navigationType],
  )

  return (
    <UNSAFE_LocationContext.Provider value={contextValue}>
      {children}
    </UNSAFE_LocationContext.Provider>
  )
}
