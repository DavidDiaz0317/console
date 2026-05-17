import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMissions } from '../../hooks/useMissions'
import { useClusters } from '../../hooks/mcp/clusters'
import { useHelmReleases } from '../../hooks/mcp/helm'
import { useToast } from '../ui/Toast'
import { AI_SUGGEST_TIMEOUT_MS } from './useMissionControl.constants'
import { useMissionControlActions } from './useMissionControl.actions'
import {
  usePlanningMissionStreamingState,
  usePlanningMissionTimeout,
} from './useMissionControl.effects'
import {
  makeInitialState,
  loadPersistedState,
  detectInstalledProjects,
  useMissionControlPersistence,
  useProjectAssignmentReconciliation,
  useStaleClusterReconciliation,
} from './useMissionControl.state'
import { useMissionControlPlanningParser } from './useMissionControl.parsing'
import type { MissionControlState } from './types'

export function useMissionControl() {
  const { showToast } = useToast()
  const [state, setState] = useState<MissionControlState>(() =>
    makeInitialState(loadPersistedState()),
  )
  const { startMission, sendMessage, missions, dismissMission } = useMissions()
  const { releases: helmReleases } = useHelmReleases()
  const {
    deduplicatedClusters: clusters,
    isLoading: clustersLoading,
    lastUpdated: clustersLastUpdated,
  } = useClusters()

  const aiTimedOutRef = useRef(false)
  const userInteractedAfterTimeoutRef = useRef(false)
  const userMutationGenerationRef = useRef(0)
  const lastDispatchedGenerationRef = useRef(0)
  const stateRef = useRef(state)
  const aiRequestInFlightRef = useRef(false)
  const helmReleasesRef = useRef(helmReleases)
  const kubaraChartNamesRef = useRef<Set<string>>(new Set())
  const planningMissionIdRef = useRef(state.planningMissionId)
  const bumpUserGeneration = useCallback(() => {
    userMutationGenerationRef.current += 1
  }, [])

  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])
  useLayoutEffect(() => {
    planningMissionIdRef.current = state.planningMissionId
  }, [state.planningMissionId])
  useLayoutEffect(() => {
    helmReleasesRef.current = helmReleases
  }, [helmReleases])

  useMissionControlPersistence(state)

  const {
    staleClusterNames,
    acknowledgeStaleClusters,
    resetStaleClusterReconciliation,
  } = useStaleClusterReconciliation({
    state,
    setState,
    clusters,
    clustersLoading,
    clustersLastUpdated,
  })

  const planningMission = missions.find((mission) => mission.id === state.planningMissionId)

  const { resetPlanningParser } = useMissionControlPlanningParser({
    phase: state.phase,
    planningMissionId: state.planningMissionId,
    planningMission,
    setState,
    kubaraChartNamesRef,
    aiTimedOutRef,
    userInteractedAfterTimeoutRef,
    userMutationGenerationRef,
    lastDispatchedGenerationRef,
  })

  usePlanningMissionStreamingState({
    planningMission,
    aiStreaming: state.aiStreaming,
    setState,
    aiRequestInFlightRef,
    showToast,
  })

  const { resetProjectAssignmentReconciliation } = useProjectAssignmentReconciliation(
    state.projects,
    setState,
  )

  const { installedProjects, installedOnCluster } = useMemo(
    () =>
      detectInstalledProjects({
        projects: state.projects,
        assignments: state.assignments,
        helmReleases,
        clusters,
      }),
    [helmReleases, clusters, state.projects, state.assignments],
  )

  const actions = useMissionControlActions({
    state,
    setState,
    clusters,
    installedOnCluster,
    missions,
    startMission,
    sendMessage,
    dismissMission,
    showToast,
    bumpUserGeneration,
    aiTimedOutRef,
    userInteractedAfterTimeoutRef,
    userMutationGenerationRef,
    lastDispatchedGenerationRef,
    stateRef,
    aiRequestInFlightRef,
    helmReleasesRef,
    kubaraChartNamesRef,
    planningMissionIdRef,
    resetPlanningParser,
    resetStaleClusterReconciliation,
    resetProjectAssignmentReconciliation,
  })

  usePlanningMissionTimeout({
    aiStreaming: state.aiStreaming,
    planningMission,
    dismissMission,
    planningMissionIdRef,
    aiRequestInFlightRef,
    aiTimedOutRef,
    setState,
    timeoutMs: AI_SUGGEST_TIMEOUT_MS,
  })

  return {
    state,
    installedProjects,
    installedOnCluster,
    setDescription: actions.setDescription,
    setTitle: actions.setTitle,
    setTargetClusters: actions.setTargetClusters,
    askAIForSuggestions: actions.askAIForSuggestions,
    addProject: actions.addProject,
    removeProject: actions.removeProject,
    updateProjectPriority: actions.updateProjectPriority,
    replaceProject: actions.replaceProject,
    askAIForAssignments: actions.askAIForAssignments,
    autoAssignProjects: actions.autoAssignProjects,
    setAssignment: actions.setAssignment,
    moveProjectToCluster: actions.moveProjectToCluster,
    setPhase: actions.setPhase,
    setOverlay: actions.setOverlay,
    setDeployMode: actions.setDeployMode,
    setDryRun: actions.setDryRun,
    updateLaunchProgress: actions.updateLaunchProgress,
    setGroundControlDashboardId: actions.setGroundControlDashboardId,
    planningMission,
    staleClusterNames,
    acknowledgeStaleClusters,
    reset: actions.reset,
    hydrateFromPlan: actions.hydrateFromPlan,
  }
}
