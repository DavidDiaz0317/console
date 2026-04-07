/**
 * useNPS — Net Promoter Score hook
 *
 * Manages when to show the NPS modal:
 * - Tracks "don't show again" preference in localStorage
 * - Enforces a 30-day cooldown between submissions
 * - Listens for `nps-trigger` custom window events fired after key actions
 *   (workload deployed, cluster added, multi-cluster operation completed)
 *
 * Usage:
 *   const { isOpen, trigger, dismiss, markSubmitted, dontShowAgain } = useNPS()
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'

const STORAGE_KEY = 'kubestellar-nps'
const NPS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export type NPSTrigger =
  | 'workload_deployed'
  | 'cluster_added'
  | 'multi_cluster_op'
  | 'manual'

interface NPSState {
  lastSubmittedAt: string | null // ISO string
  dismissed: boolean
  neverShow: boolean
}

function readState(): NPSState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as NPSState
  } catch {
    // ignore
  }
  return { lastSubmittedAt: null, dismissed: false, neverShow: false }
}

function writeState(state: NPSState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota errors
  }
}

function isCooldownActive(state: NPSState): boolean {
  if (!state.lastSubmittedAt) return false
  const last = new Date(state.lastSubmittedAt).getTime()
  return Date.now() - last < NPS_COOLDOWN_MS
}

function shouldShow(state: NPSState): boolean {
  if (state.neverShow) return false
  if (isCooldownActive(state)) return false
  return true
}

export interface UseNPSResult {
  isOpen: boolean
  currentTrigger: NPSTrigger | null
  /** Mark submission complete; persists cooldown and closes modal */
  markSubmitted: (score: number, reason: string) => Promise<void>
  /** Dismiss the modal for now (respects cooldown after next submit) */
  dismiss: () => void
  /** Never show NPS again ("Don't show again" button) */
  neverShow: () => void
}

export function useNPS(): UseNPSResult {
  const [isOpen, setIsOpen] = useState(false)
  const [currentTrigger, setCurrentTrigger] = useState<NPSTrigger | null>(null)
  // Keep a ref to avoid stale closure in the event listener
  const triggerRef = useRef<NPSTrigger | null>(null)

  // Handle inbound trigger events
  const handleTrigger = useCallback((e: Event) => {
    const detail = (e as CustomEvent<{ trigger?: NPSTrigger }>).detail
    const triggerName: NPSTrigger = detail?.trigger ?? 'manual'
    const state = readState()
    if (!shouldShow(state)) return
    triggerRef.current = triggerName
    setCurrentTrigger(triggerName)
    setIsOpen(true)
  }, [])

  useEffect(() => {
    window.addEventListener('nps-trigger', handleTrigger)
    return () => window.removeEventListener('nps-trigger', handleTrigger)
  }, [handleTrigger])

  const markSubmitted = useCallback(async (score: number, reason: string) => {
    const state = readState()
    state.lastSubmittedAt = new Date().toISOString()
    state.dismissed = false
    writeState(state)

    setIsOpen(false)
    setCurrentTrigger(null)

    // Fire-and-forget to backend — UI doesn't need to wait
    try {
      await fetch('/api/nps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, reason, trigger: triggerRef.current ?? 'manual' }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
    } catch {
      // Network errors are silent — the localStorage state is the source of truth
      // for the cooldown; the backend record is best-effort.
    }
  }, [])

  const dismiss = useCallback(() => {
    setIsOpen(false)
    setCurrentTrigger(null)
    // Mark dismissed so we don't show again this session; cooldown starts after submit
    const state = readState()
    state.dismissed = true
    writeState(state)
  }, [])

  const neverShow = useCallback(() => {
    setIsOpen(false)
    setCurrentTrigger(null)
    const state = readState()
    state.neverShow = true
    writeState(state)
  }, [])

  return { isOpen, currentTrigger, markSubmitted, dismiss, neverShow }
}

/**
 * Utility — fire an NPS trigger event from anywhere in the app.
 * Import and call this after key actions.
 *
 * @example
 *   triggerNPS('workload_deployed')
 */
export function triggerNPS(trigger: NPSTrigger = 'manual') {
  window.dispatchEvent(new CustomEvent('nps-trigger', { detail: { trigger } }))
}
