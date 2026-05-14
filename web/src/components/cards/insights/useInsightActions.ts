/**
 * Hook for managing insight acknowledgement and dismissal state.
 *
 * - Acknowledged insights persist in localStorage across sessions
 * - Dismissed insights persist only in sessionStorage (current session)
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../ui/Toast'

/** localStorage key for acknowledged insight IDs */
const INSIGHT_ACKNOWLEDGE_KEY = 'acknowledged-insights'
/** sessionStorage key for dismissed insight IDs (session only) */
const INSIGHT_DISMISS_KEY = 'dismissed-insights-session'

function loadSet(storage: Storage, key: string): Set<string> {
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
    return new Set()
  }
}

type ErrorCallback = (message: string) => void

function saveSet(storage: Storage, key: string, set: Set<string>, onError?: ErrorCallback): void {
  try {
    storage.setItem(key, JSON.stringify(Array.from(set)))
  } catch (err: unknown) {
    console.error(`[useInsightActions] Failed to save ${key} to storage:`, err)
    if (onError) onError('')
  }
}

export function useInsightActions() {
  const { t } = useTranslation('cards')
  const { showToast } = useToast()

  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(
    () => loadSet(localStorage, INSIGHT_ACKNOWLEDGE_KEY)
  )
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => loadSet(sessionStorage, INSIGHT_DISMISS_KEY)
  )

  // Detect load errors on mount and notify user
  useEffect(() => {
    const ackRaw = localStorage.getItem(INSIGHT_ACKNOWLEDGE_KEY)
    const dismissRaw = sessionStorage.getItem(INSIGHT_DISMISS_KEY)
    let hasError = false
    if (ackRaw) {
      try {
        const parsed = JSON.parse(ackRaw)
        if (!Array.isArray(parsed)) hasError = true
      } catch { hasError = true }
    }
    if (dismissRaw) {
      try {
        const parsed = JSON.parse(dismissRaw)
        if (!Array.isArray(parsed)) hasError = true
      } catch { hasError = true }
    }
    if (hasError) {
      showToast(t('insights.failedToLoadPreferences'), 'warning')
    }
  }, [t, showToast]) // eslint-disable-line react-hooks/exhaustive-deps

  const acknowledgeInsight = (id: string) => {
    setAcknowledgedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      saveSet(localStorage, INSIGHT_ACKNOWLEDGE_KEY, next, () => showToast(t('insights.failedToSave'), 'error'))
      return next
    })
  }

  const dismissInsight = (id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      saveSet(sessionStorage, INSIGHT_DISMISS_KEY, next, () => showToast(t('insights.failedToSave'), 'error'))
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
