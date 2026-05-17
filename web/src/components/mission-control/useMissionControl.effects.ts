import { useEffect } from 'react'
import type {
  MissionControlDismissMission,
  MissionControlMissionLike,
  MissionControlRef,
  MissionControlShowToast,
  MissionControlStateSetter,
} from './useMissionControl.types'

export function usePlanningMissionStreamingState({
  planningMission,
  aiStreaming,
  setState,
  aiRequestInFlightRef,
  showToast,
}: {
  planningMission: MissionControlMissionLike | undefined
  aiStreaming: boolean
  setState: MissionControlStateSetter
  aiRequestInFlightRef: MissionControlRef<boolean>
  showToast: MissionControlShowToast
}): void {
  useEffect(() => {
    if (!planningMission) return
    const status = planningMission.status
    const terminalStates: ReadonlySet<typeof status> = new Set([
      'failed',
      'completed',
      'cancelled',
      'blocked',
    ] as const)
    const isStreaming = status === 'running'
    const isTerminal = terminalStates.has(status)
    if (isStreaming !== aiStreaming) {
      setState((prev) => ({ ...prev, aiStreaming: isStreaming }))
      if (!isStreaming) aiRequestInFlightRef.current = false
    } else if (isTerminal && aiStreaming) {
      setState((prev) => ({ ...prev, aiStreaming: false }))
      aiRequestInFlightRef.current = false
    }

    if (status === 'failed' && aiStreaming) {
      const planningMessages = planningMission.messages || []
      const lastMessage = planningMessages[planningMessages.length - 1]
      const messageText = (lastMessage?.content || '').toLowerCase()
      const isAuthError =
        messageText.includes('401') ||
        messageText.includes('unauthorized') ||
        messageText.includes('authentication') ||
        messageText.includes('token')
      const toastMessage = isAuthError
        ? 'Agent returned 401 Unauthorized — check kc-agent credentials or restart the agent'
        : 'AI suggestion failed — local agent is unavailable or returned an error'
      showToast(toastMessage, 'error')
    }
  }, [planningMission?.status, aiStreaming])
}

export function usePlanningMissionTimeout({
  aiStreaming,
  planningMission,
  dismissMission,
  planningMissionIdRef,
  aiRequestInFlightRef,
  aiTimedOutRef,
  setState,
  timeoutMs,
}: {
  aiStreaming: boolean
  planningMission: MissionControlMissionLike | undefined
  dismissMission: MissionControlDismissMission
  planningMissionIdRef: MissionControlRef<string | undefined>
  aiRequestInFlightRef: MissionControlRef<boolean>
  aiTimedOutRef: MissionControlRef<boolean>
  setState: MissionControlStateSetter
  timeoutMs: number
}): void {
  useEffect(() => {
    if (!aiStreaming) return
    if (planningMission) return
    const timer = setTimeout(() => {
      const missionId = planningMissionIdRef.current
      if (missionId) {
        try {
          dismissMission(missionId)
        } catch {
          // ignore
        }
      }
      setState((prev) => {
        if (!prev.aiStreaming) return prev
        aiRequestInFlightRef.current = false
        aiTimedOutRef.current = true
        return { ...prev, aiStreaming: false }
      })
    }, timeoutMs)
    return () => clearTimeout(timer)
  }, [aiStreaming, planningMission, dismissMission, timeoutMs])
}
