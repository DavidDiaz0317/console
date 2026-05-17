import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { isDemoMode } from '../../lib/demoMode'
import { logger } from '@/lib/logger'
import { getDemoMissionControlState } from './demoState'
import {
  PERSIST_KEYSTROKE_DEBOUNCE_MS,
  PERSISTED_SCHEMA_VERSION,
  QUOTA_BANNER_KEY,
  STORAGE_KEY,
  WIZARD_STATE_TTL_MS,
} from './useMissionControl.constants'
import type {
  MissionControlClusterInfo,
  MissionControlHelmRelease,
  MissionControlStateSetter,
  PersistedStateEntry,
} from './useMissionControl.types'
import type { ClusterAssignment, MissionControlState, PayloadProject } from './types'

let quotaBannerFallbackTitle: string | null = null

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22)
  )
}

export function loadPersistedState(): Partial<MissionControlState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return isDemoMode() ? getDemoMissionControlState() : null

    const parsedRaw: unknown = JSON.parse(raw)
    if (!isPlainObject(parsedRaw)) {
      logger.warn(
        `[MissionControl] issue 6664 — persisted state at "${STORAGE_KEY}" is not a plain object ` +
          `(typeof=${typeof parsedRaw}, isArray=${Array.isArray(parsedRaw)}); clearing.`,
      )
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // localStorage unavailable
      }
      return isDemoMode() ? getDemoMissionControlState() : null
    }

    const entry = parsedRaw as PersistedStateEntry | Partial<MissionControlState>
    if ('savedAt' in entry && typeof entry.savedAt === 'number') {
      if (entry.schemaVersion !== undefined && entry.schemaVersion !== PERSISTED_SCHEMA_VERSION) {
        logger.warn(
          `[MissionControl] issue 6664 — persisted schema version ${entry.schemaVersion} ` +
            `does not match current ${PERSISTED_SCHEMA_VERSION}; clearing.`,
        )
        try {
          sessionStorage.setItem(QUOTA_BANNER_KEY, 'schema_mismatch')
        } catch {
          // sessionStorage unavailable
        }
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {
          // localStorage unavailable
        }
        return isDemoMode() ? getDemoMissionControlState() : null
      }

      if (Date.now() - entry.savedAt > WIZARD_STATE_TTL_MS) {
        localStorage.removeItem(STORAGE_KEY)
        return isDemoMode() ? getDemoMissionControlState() : null
      }

      const state = entry.state
      return isDemoMode() && (!state?.projects || state.projects.length === 0)
        ? getDemoMissionControlState()
        : state
    }

    const legacy = entry as Partial<MissionControlState>
    return isDemoMode() && (!legacy.projects || legacy.projects.length === 0)
      ? getDemoMissionControlState()
      : legacy
  } catch {
    return null
  }
}

export function persistState(state: MissionControlState): void {
  try {
    const entry: PersistedStateEntry = {
      state,
      savedAt: Date.now(),
      schemaVersion: PERSISTED_SCHEMA_VERSION,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
  } catch (error: unknown) {
    if (isQuotaExceededError(error)) {
      const title = state.title || '(untitled mission)'
      logger.warn(
        `[MissionControl] issue 6665 — localStorage quota exceeded while persisting ` +
          `Mission Control wizard state for "${title}". Your in-progress draft is ` +
          'not being persisted and will be lost on reload unless space is freed.',
      )
      try {
        sessionStorage.setItem(QUOTA_BANNER_KEY, title)
        quotaBannerFallbackTitle = null
      } catch {
        quotaBannerFallbackTitle = title
      }
      return
    }
    logger.error('[MissionControl] Failed to persist state:', error)
  }
}

export function consumePersistQuotaBanner(): string | null {
  try {
    const value = sessionStorage.getItem(QUOTA_BANNER_KEY)
    if (value !== null) sessionStorage.removeItem(QUOTA_BANNER_KEY)
    return value
  } catch {
    const fallback = quotaBannerFallbackTitle
    quotaBannerFallbackTitle = null
    return fallback
  }
}

export function makeInitialState(persisted?: Partial<MissionControlState> | null): MissionControlState {
  return {
    phase: persisted?.phase ?? 'define',
    description: persisted?.description ?? '',
    title: persisted?.title ?? '',
    projects: persisted?.projects ?? [],
    assignments: persisted?.assignments ?? [],
    phases: persisted?.phases ?? [],
    overlay: persisted?.overlay ?? 'architecture',
    deployMode: persisted?.deployMode ?? 'phased',
    isDryRun: persisted?.isDryRun ?? false,
    targetClusters: persisted?.targetClusters ?? [],
    planningMissionId: persisted?.planningMissionId,
    aiStreaming: false,
    launchProgress: persisted?.launchProgress ?? [],
    groundControlDashboardId: persisted?.groundControlDashboardId,
  }
}

export function useMissionControlPersistence(state: MissionControlState): void {
  const debouncedState = useDebouncedValue(state, PERSIST_KEYSTROKE_DEBOUNCE_MS)
  useEffect(() => {
    persistState(debouncedState)
  }, [debouncedState])

  const stateRefForFlush = useRef(state)
  useLayoutEffect(() => {
    stateRefForFlush.current = state
  }, [state])

  useEffect(() => {
    const onBeforeUnload = () => persistState(stateRefForFlush.current)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])
}

interface StaleClusterReconciliationParams {
  state: MissionControlState
  setState: MissionControlStateSetter
  clusters: MissionControlClusterInfo[]
  clustersLoading: boolean
  clustersLastUpdated: Date | null | undefined
}

export function useStaleClusterReconciliation({
  state,
  setState,
  clusters,
  clustersLoading,
  clustersLastUpdated,
}: StaleClusterReconciliationParams) {
  const [staleClusterNames, setStaleClusterNames] = useState<string[]>([])
  const staleReconcileDoneRef = useRef(false)

  useEffect(() => {
    let isMounted = true
    if (staleReconcileDoneRef.current || clustersLoading || clustersLastUpdated == null) {
      return () => {
        isMounted = false
      }
    }

    const hasReferences = state.assignments.length > 0 || state.targetClusters.length > 0
    if (!hasReferences) {
      staleReconcileDoneRef.current = true
      return () => {
        isMounted = false
      }
    }

    const liveByName = new Map((clusters || []).map((cluster) => [cluster.name, cluster]))
    const staleFromAssignments = state.assignments
      .filter((assignment) => {
        const live = liveByName.get(assignment.clusterName)
        return !live || Boolean(assignment.clusterServer && live.server && assignment.clusterServer !== live.server)
      })
      .map((assignment) => assignment.clusterName)
    const staleFromTargets = state.targetClusters.filter((name) => !liveByName.has(name))
    const allStale = Array.from(new Set([...staleFromAssignments, ...staleFromTargets]))

    staleReconcileDoneRef.current = true
    if (allStale.length === 0 || !isMounted) {
      return () => {
        isMounted = false
      }
    }

    const staleAssignmentNames = new Set(staleFromAssignments)
    setStaleClusterNames(allStale)
    setState((prev) => ({
      ...prev,
      assignments: prev.assignments.filter(
        (assignment) =>
          (clusters || []).some((cluster) => cluster.name === assignment.clusterName) &&
          !staleAssignmentNames.has(assignment.clusterName),
      ),
      targetClusters: prev.targetClusters.filter((name) => liveByName.has(name)),
      phases: [],
    }))
    logger.warn(
      `[MissionControl] issue 6403 — dropped ${allStale.length} stale cluster reference(s) from persisted state: ${allStale.join(', ')}`,
    )

    return () => {
      isMounted = false
    }
  }, [clusters, clustersLastUpdated, clustersLoading, setState, state.assignments, state.targetClusters])

  return {
    staleClusterNames,
    acknowledgeStaleClusters: () => setStaleClusterNames([]),
    resetStaleClusterReconciliation: () => {
      staleReconcileDoneRef.current = false
      setStaleClusterNames([])
    },
  }
}

export function useProjectAssignmentReconciliation(
  projects: PayloadProject[],
  updateState: (recipe: (prev: MissionControlState) => MissionControlState) => void,
) {
  const prevProjectNamesRef = useRef('')

  useEffect(() => {
    const currentKey = JSON.stringify((projects || []).map((project) => project.name).sort())
    if (currentKey === prevProjectNamesRef.current) return
    prevProjectNamesRef.current = currentKey

    const projectNames = new Set((projects || []).map((project) => project.name))
    updateState((prev) => {
      const assignments = (prev.assignments || []).map((assignment) => ({
        ...assignment,
        projectNames: (assignment.projectNames || []).filter((name) => projectNames.has(name)),
      }))
      const allAssignedNames = new Set(assignments.flatMap((assignment) => assignment.projectNames || []))
      const newProjects = [...projectNames].filter((name) => !allAssignedNames.has(name))
      if (newProjects.length > 0 && assignments.length > 0) {
        assignments[0] = {
          ...assignments[0],
          projectNames: [...(assignments[0].projectNames || []), ...newProjects],
        }
      }
      return { ...prev, assignments, phases: [] }
    })
  }, [projects, updateState])

  return {
    resetProjectAssignmentReconciliation: () => {
      prevProjectNamesRef.current = ''
    },
  }
}

export function detectInstalledProjects({
  projects,
  assignments,
  helmReleases,
  clusters,
}: {
  projects: PayloadProject[]
  assignments: ClusterAssignment[]
  helmReleases: MissionControlHelmRelease[]
  clusters: MissionControlClusterInfo[]
}) {
  const installedProjects = new Set<string>()
  const installedOnCluster = new Map<string, Set<string>>()
  if ((projects || []).length === 0) return { installedProjects, installedOnCluster }

  const namespaceAliases: Record<string, string[]> = {
    monitoring: ['prometheus', 'grafana', 'alertmanager', 'thanos'],
    observability: ['prometheus', 'grafana', 'alertmanager', 'jaeger', 'tempo'],
    logging: ['fluent-bit', 'fluentd', 'loki', 'fluentbit'],
    security: ['falco', 'kyverno', 'opa', 'trivy'],
    ingress: ['nginx', 'traefik', 'haproxy', 'ingress-nginx'],
    'gatekeeper-system': ['opa', 'open-policy-agent', 'opa-gatekeeper'],
  }
  const bundleReleases: Record<string, string[]> = {
    'kube-prometheus-stack': ['prometheus', 'grafana', 'alertmanager', 'thanos', 'node-exporter'],
    'prometheus-operator': ['prometheus', 'grafana', 'alertmanager'],
    'loki-stack': ['loki', 'promtail', 'grafana'],
    'elastic-stack': ['elasticsearch', 'kibana', 'logstash', 'filebeat'],
    'opentelemetry-collector': ['opentelemetry-collector'],
    'opentelemetry-operator': ['opentelemetry-collector', 'opentelemetry-operator'],
    'istio-addons': ['prometheus', 'grafana', 'jaeger', 'kiali'],
  }
  const expandBundle = (releaseName: string, chartName: string): string[] | null => {
    for (const [bundleKey, bundleProjects] of Object.entries(bundleReleases)) {
      if (releaseName.includes(bundleKey) || chartName.includes(bundleKey)) return bundleProjects
    }
    return null
  }

  const clusterNames = new Map<string, Set<string>>()
  for (const release of helmReleases || []) {
    const clusterName = release.cluster || '_unknown'
    if (!clusterNames.has(clusterName)) clusterNames.set(clusterName, new Set())
    const names = clusterNames.get(clusterName)
    if (!names) continue
    names.add(release.name.toLowerCase())
    if (release.chart) names.add(release.chart.toLowerCase().replace(/-\d+.*$/, ''))
  }

  for (const release of helmReleases || []) {
    if (!release.namespace) continue
    const aliases = namespaceAliases[release.namespace.toLowerCase()]
    if (!aliases) continue
    const clusterName = release.cluster || '_unknown'
    if (!clusterNames.has(clusterName)) clusterNames.set(clusterName, new Set())
    const names = clusterNames.get(clusterName)
    if (!names) continue
    const releaseName = (release.name || '').toLowerCase()
    const chartName = (release.chart || '').toLowerCase()
    const bundled = expandBundle(releaseName, chartName)
    if (bundled) {
      for (const name of bundled) {
        if (aliases.includes(name)) names.add(name)
      }
      continue
    }
    for (const alias of aliases) {
      if (releaseName.includes(alias) || chartName.includes(alias)) names.add(alias)
    }
  }

  for (const cluster of clusters || []) {
    if (!clusterNames.has(cluster.name)) clusterNames.set(cluster.name, new Set())
  }

  for (const project of projects || []) {
    const projectName = project.name.toLowerCase()
    for (const [clusterName, names] of clusterNames) {
      if (!names.has(projectName)) continue
      installedProjects.add(project.name)
      if (!installedOnCluster.has(project.name)) installedOnCluster.set(project.name, new Set())
      installedOnCluster.get(project.name)?.add(clusterName)
    }
  }

  if (isDemoMode() && installedProjects.size === 0 && (projects || []).length > 0) {
    for (const name of ['prometheus', 'cert-manager']) {
      if (!(projects || []).some((project) => project.name === name)) continue
      installedProjects.add(name)
      const firstCluster = assignments[0]?.clusterName
      if (!firstCluster) continue
      if (!installedOnCluster.has(name)) installedOnCluster.set(name, new Set())
      installedOnCluster.get(name)?.add(firstCluster)
    }
  }

  return { installedProjects, installedOnCluster }
}
