/**
 * Hook for managing insight acknowledgement and dismissal state.
 *
 * - Acknowledged insights persist in localStorage across sessions
 * - Dismissed insights persist only in sessionStorage (current session)
 */

import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../ui/Toast'

/** localStorage key for acknowledged insight IDs */
const INSIGHT_ACKNOWLEDGE_KEY = 'acknowledged-insights'
/** sessionStorage key for dismissed insight IDs (session only) */
const INSIGHT_DISMISS_KEY = 'dismissed-insights-session'

type NotifyError = (key: string, type: 'error' | 'warning') => void

function loadSet(storage: Storage, key: string, onError?: NotifyError): Set<string> {
  try {
    const raw = storage.getItem(key)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.warn(`[useInsightActions] Invalid data in ${key}: expected array, got ${typeof parsed}`)
      return new Set()
    }
    return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch (err: unknown) {
    console.error(`[useInsightActions] Failed to load ${key} from storage:`, err)
    onError?.('insights.failedToLoadPreferences', 'warning')
    return new Set()
  }
}

function saveSet(storage: Storage, key: string, set: Set<string>, onError?: NotifyError): void {
  try {
    storage.setItem(key, JSON.stringify(Array.from(set)))
  } catch (err: unknown) {
    console.error(`[useInsightActions] Failed to save ${key} to storage:`, err)
    onError?.('insights.failedToSave', 'error')
  }
}

export function useInsightActions() {
  const { t } = useTranslation('cards')
  const { showToast } = useToast()
  const showToastRef = useRef(showToast)
  showToastRef.current = showToast

  const notifyError: NotifyError = useCallback((key: string, type: 'error' | 'warning') => {
    showToastRef.current(t(key), type)
  }, [t])

  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(
    () => loadSet(localStorage, INSIGHT_ACKNOWLEDGE_KEY, notifyError)
  )
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => loadSet(sessionStorage, INSIGHT_DISMISS_KEY, notifyError)
  )

  const acknowledgeInsight = (id: string) => {
    setAcknowledgedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      saveSet(localStorage, INSIGHT_ACKNOWLEDGE_KEY, next, notifyError)
      return next
    })
  }

  const dismissInsight = (id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      saveSet(sessionStorage, INSIGHT_DISMISS_KEY, next, notifyError)
      return next
    })
  }

  const isAcknowledged = (id: string) => acknowledgedIds.has(id)
  const isDismissed = (id: string) => dismissedIds.has(id)

  const acknowledgedCount = acknowledgedIds.size

  return {
    acknowledgeInsight,
    dismissInsight,
    isAcknowledged,
    isDismissed,
    acknowledgedCount }
}
