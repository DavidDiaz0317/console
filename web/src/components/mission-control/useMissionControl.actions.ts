import { useCallback } from 'react'
import { STORAGE_KEY } from './useMissionControl.constants'
import {
  autoAssignProjectsToClusters,
  beginMissionControlAiRequest,
  buildAssignmentsPrompt,
  buildSuggestionsPrompt,
  loadKubaraChartNames,
  resetOversizedWarnings,
  runMissionControlPlanningPrompt,
} from './useMissionControl.helpers'
import { makeInitialState, persistState } from './useMissionControl.state'
import type {
  MissionControlClusterInfo,
  MissionControlDismissMission,
  MissionControlMissionLike,
  MissionControlRef,
  MissionControlSendMessage,
  MissionControlShowToast,
  MissionControlStartMission,
  MissionControlStateSetter,
} from './useMissionControl.types'
import type {
  MissionControlState,
  OverlayMode,
  PayloadProject,
  PhaseProgress,
  WizardPhase,
} from './types'

export function useMissionControlActions({
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
}: {
  state: MissionControlState
  setState: MissionControlStateSetter
  clusters: MissionControlClusterInfo[]
  installedOnCluster: Map<string, Set<string>>
  missions: MissionControlMissionLike[]
  startMission: MissionControlStartMission
  sendMessage: MissionControlSendMessage
  dismissMission: MissionControlDismissMission
  showToast: MissionControlShowToast
  bumpUserGeneration: () => void
  aiTimedOutRef: MissionControlRef<boolean>
  userInteractedAfterTimeoutRef: MissionControlRef<boolean>
  userMutationGenerationRef: MissionControlRef<number>
  lastDispatchedGenerationRef: MissionControlRef<number>
  stateRef: MissionControlRef<MissionControlState>
  aiRequestInFlightRef: MissionControlRef<boolean>
  helmReleasesRef: MissionControlRef<Array<{ name: string; chart?: string; namespace?: string; status?: string; cluster?: string }>>
  kubaraChartNamesRef: MissionControlRef<Set<string>>
  planningMissionIdRef: MissionControlRef<string | undefined>
  resetPlanningParser: () => void
  resetStaleClusterReconciliation: () => void
  resetProjectAssignmentReconciliation: () => void
}) {
  const markUserInteractionAfterTimeout = () => {
    if (aiTimedOutRef.current) userInteractedAfterTimeoutRef.current = true
  }

  const setDescription = (description: string) => {
    markUserInteractionAfterTimeout()
    setState((prev) => ({ ...prev, description }))
  }

  const setTitle = (title: string) => {
    setState((prev) => ({ ...prev, title }))
  }

  const setTargetClusters = (targetClusters: string[]) => {
    setState((prev) => {
      const next = { ...prev, targetClusters }
      persistState(next)
      return next
    })
  }

  const askAIForSuggestions = async (description: string, existingProjects: PayloadProject[] = []) => {
    const currentState = stateRef.current
    if (!beginMissionControlAiRequest({
      aiRequestInFlightRef,
      aiTimedOutRef,
      userInteractedAfterTimeoutRef,
      isStreaming: currentState.aiStreaming,
      inFlightCode: '#6827',
      streamingCode: 'issue 6406',
    })) {
      return
    }

    const currentPlanningMissionId = planningMissionIdRef.current ?? currentState.planningMissionId
    kubaraChartNamesRef.current = await loadKubaraChartNames()
    runMissionControlPlanningPrompt({
      currentPlanningMissionId,
      missions,
      prompt: buildSuggestionsPrompt({
        description,
        existingProjects,
        targetClusters: currentState.targetClusters,
        helmReleases: helmReleasesRef.current,
        kubaraChartNames: kubaraChartNamesRef.current,
      }),
      description: 'AI-assisted fix planning',
      errorMessage: '#6811 — askAIForSuggestions failed',
      toastMessage: 'AI suggestion request failed — please try again',
      startMission,
      sendMessage,
      updateState: setState,
      planningMissionIdRef,
      aiRequestInFlightRef,
      showToast,
    })
  }

  const addProject = (project: PayloadProject) => {
    bumpUserGeneration()
    markUserInteractionAfterTimeout()
    const tagged: PayloadProject = { ...project, userAdded: true }
    setState((prev) => ({
      ...prev,
      projects: prev.projects.some((entry) => entry.name === tagged.name)
        ? prev.projects
        : [...prev.projects, tagged],
    }))
  }

  const removeProject = (name: string) => {
    bumpUserGeneration()
    markUserInteractionAfterTimeout()
    setState((prev) => ({
      ...prev,
      projects: prev.projects.filter((project) => project.name !== name),
    }))
  }

  const updateProjectPriority = (name: string, priority: PayloadProject['priority']) => {
    bumpUserGeneration()
    markUserInteractionAfterTimeout()
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((project) => (project.name === name ? { ...project, priority } : project)),
    }))
  }

  const replaceProject = (oldName: string, newProject: PayloadProject) => {
    bumpUserGeneration()
    markUserInteractionAfterTimeout()
    setState((prev) => {
      const existing = prev.projects.find((project) => project.name === oldName)
      const originalName = existing?.originalName ?? oldName
      const effectiveOriginalName = newProject.name === originalName ? undefined : originalName
      const isSwapBackToOriginal = newProject.name === originalName
      return {
        ...prev,
        projects: prev.projects.map((project) =>
          project.name === oldName
            ? {
                ...newProject,
                originalName: effectiveOriginalName,
                userAdded: isSwapBackToOriginal ? existing?.userAdded : true,
              }
            : project,
        ),
        assignments: prev.assignments.map((assignment) => ({
          ...assignment,
          projectNames: assignment.projectNames.map((name) => (name === oldName ? newProject.name : name)),
        })),
      }
    })
  }

  const askAIForAssignments = (projects: PayloadProject[], clustersJson: string) => {
    const currentState = stateRef.current
    if (!beginMissionControlAiRequest({
      aiRequestInFlightRef,
      aiTimedOutRef,
      userInteractedAfterTimeoutRef,
      isStreaming: currentState.aiStreaming,
      inFlightCode: '#7111',
      streamingCode: 'issue 6406',
    })) {
      return
    }

    lastDispatchedGenerationRef.current = userMutationGenerationRef.current
    runMissionControlPlanningPrompt({
      currentPlanningMissionId: currentState.planningMissionId,
      missions,
      prompt: buildAssignmentsPrompt(projects, clustersJson),
      description: 'AI-assisted cluster assignment',
      errorMessage: '#7117 — askAIForAssignments failed',
      toastMessage: 'AI assignment request failed — please try again',
      startMission,
      sendMessage,
      updateState: setState,
      planningMissionIdRef,
      aiRequestInFlightRef,
      showToast,
    })
  }

  const moveProjectToCluster = (projectName: string, fromCluster: string, toCluster: string) => {
    if (fromCluster === toCluster) return
    bumpUserGeneration()
    setState((prev) => ({
      ...prev,
      assignments: prev.assignments.map((assignment) => {
        if (assignment.clusterName === fromCluster) {
          return {
            ...assignment,
            projectNames: assignment.projectNames.filter((name) => name !== projectName),
          }
        }
        if (assignment.clusterName === toCluster) {
          return {
            ...assignment,
            projectNames: assignment.projectNames.includes(projectName)
              ? assignment.projectNames
              : [...assignment.projectNames, projectName],
          }
        }
        return assignment
      }),
    }))
  }

  const setAssignment = (clusterName: string, projectName: string, assigned: boolean) => {
    bumpUserGeneration()
    setState((prev) => {
      const assignments = [...prev.assignments]
      const index = assignments.findIndex((assignment) => assignment.clusterName === clusterName)
      if (index >= 0) {
        const existing = assignments[index]
        assignments[index] = {
          ...existing,
          projectNames: assigned
            ? existing.projectNames.includes(projectName)
              ? existing.projectNames
              : [...existing.projectNames, projectName]
            : existing.projectNames.filter((name) => name !== projectName),
        }
      } else if (assigned) {
        const liveCluster = clusters.find((cluster) => cluster.name === clusterName)
        assignments.push({
          clusterName,
          clusterContext: liveCluster?.context ?? clusterName,
          clusterServer: liveCluster?.server,
          provider: 'kubernetes',
          projectNames: [projectName],
          warnings: [],
          readiness: {
            cpuHeadroomPercent: 50,
            memHeadroomPercent: 50,
            storageHeadroomPercent: 50,
            overallScore: 50,
          },
        })
      }
      const next = { ...prev, assignments }
      persistState(next)
      return next
    })
  }

  const setPhase = (phase: WizardPhase) => {
    bumpUserGeneration()
    setState((prev) => {
      const next = { ...prev, phase }
      persistState(next)
      return next
    })
  }

  const setOverlay = (overlay: OverlayMode) => {
    setState((prev) => ({ ...prev, overlay }))
  }

  const setDeployMode = (deployMode: 'phased' | 'yolo') => {
    setState((prev) => ({ ...prev, deployMode }))
  }

  const setDryRun = (isDryRun: boolean) => {
    setState((prev) => ({ ...prev, isDryRun }))
  }

  const updateLaunchProgress = useCallback((progress: PhaseProgress[]) => {
    setState((prev) => ({ ...prev, launchProgress: progress }))
  }, [setState])

  const setGroundControlDashboardId = (id: string) => {
    setState((prev) => ({ ...prev, groundControlDashboardId: id }))
  }

  const reset = () => {
    const previousPlanningMissionId = state.planningMissionId
    if (previousPlanningMissionId) {
      try {
        dismissMission(previousPlanningMissionId)
      } catch {
        // ignore
      }
    }
    resetOversizedWarnings()
    resetStaleClusterReconciliation()
    resetProjectAssignmentReconciliation()
    userMutationGenerationRef.current = 0
    lastDispatchedGenerationRef.current = 0
    aiTimedOutRef.current = false
    userInteractedAfterTimeoutRef.current = false
    localStorage.removeItem(STORAGE_KEY)
    resetPlanningParser()
    setState(makeInitialState())
  }

  const hydrateFromPlan = (partial: Partial<MissionControlState>) => {
    setState(() => ({
      ...makeInitialState(),
      ...partial,
      phase: 'blueprint',
      aiStreaming: false,
      launchProgress: [],
    }))
  }

  const autoAssignProjects = async (availableClusters: MissionControlClusterInfo[]) => {
    if (availableClusters.length === 0 || state.projects.length === 0) return
    const assignments = await autoAssignProjectsToClusters({
      projects: state.projects,
      availableClusters,
      installedOnCluster,
      existingAssignments: state.assignments,
    })
    setState((prev) => ({ ...prev, assignments }))
  }

  return {
    setDescription,
    setTitle,
    setTargetClusters,
    askAIForSuggestions,
    addProject,
    removeProject,
    updateProjectPriority,
    replaceProject,
    askAIForAssignments,
    autoAssignProjects,
    setAssignment,
    moveProjectToCluster,
    setPhase,
    setOverlay,
    setDeployMode,
    setDryRun,
    updateLaunchProgress,
    setGroundControlDashboardId,
    reset,
    hydrateFromPlan,
  }
}
