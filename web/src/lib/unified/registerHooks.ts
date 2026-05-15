/**
 * Unified Card System - Hook Registration
 *
 * This file registers data hooks with the unified card system.
 * Import this file early in the application (e.g., in main.tsx) to make
 * hooks available for unified cards.
 *
 * IMPORTANT: These hooks are called inside the useDataSource hook,
 * which is a React hook. The registered functions must follow React's
 * rules of hooks - they are called consistently on every render.
 *
 * Time constants imported from lib/constants/time.
 */

import { useState, useEffect } from 'react'
import { useDemoMode } from '../../hooks/useDemoMode'
import { registerDataHook } from './card/hooks/useDataSource'
import { SHORT_DELAY_MS } from '../constants/network'
import { MS_PER_SECOND, MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../constants/time'
import {
  useCachedPodIssues,
  useCachedEvents,
  useCachedDeployments,
  useCachedDeploymentIssues } from '../../hooks/useCachedData'
import {
  useClusters,
  usePVCs,
  useServices,
  useOperators,
  useHelmReleases,
  useConfigMaps,
  useSecrets,
  useIngresses,
  useNodes,
  useJobs,
  useCronJobs,
  useStatefulSets,
  useDaemonSets,
  useHPAs,
  useReplicaSets,
  usePVs,
  useResourceQuotas,
  useLimitRanges,
  useNetworkPolicies,
  useNamespaces,
  useOperatorSubscriptions,
  useServiceAccounts,
  useK8sRoles,
  useK8sRoleBindings } from '../../hooks/mcp'
import {
  useServiceExports,
  useServiceImports } from '../../hooks/useMCS'
import { useFluxStatus } from '../../components/cards/flux_status/useFluxStatus'
import { useCachedBackstage } from '../../hooks/useCachedBackstage'
import { useContourStatus } from '../../components/cards/contour_status/useContourStatus'
import { useChaosMeshStatus } from '../../components/cards/chaos_mesh_status/useChaosMeshStatus'
import { useCachedContainerd } from '../../hooks/useCachedContainerd'
import { useCachedCortex } from '../../hooks/useCachedCortex'
import { useCachedDapr } from '../../hooks/useCachedDapr'
import { useCachedDragonfly } from '../../hooks/useCachedDragonfly'
import { useCachedEnvoy } from '../../components/cards/envoy_status/useCachedEnvoy'
import { useCachedGrpc } from '../../hooks/useCachedGrpc'
import { useCachedKeda } from '../../hooks/useCachedKeda'
import { useCachedKserve } from '../../hooks/useCachedKserve'
import { useCachedKubevela } from '../../hooks/useCachedKubevela'
import { useCachedLinkerd } from '../../hooks/useCachedLinkerd'
import { useCachedOpenfeature } from '../../hooks/useCachedOpenfeature'
import { useCachedLonghorn } from '../../hooks/useCachedLonghorn'
import { useCachedOpenfga } from '../../hooks/useCachedOpenfga'
import { useCachedOtel } from '../../hooks/useCachedOtel'
import { useCachedRook } from '../../hooks/useCachedRook'
import { useCachedSpiffe } from '../../hooks/useCachedSpiffe'
import { useCachedCni } from '../../hooks/useCachedCni'
import { useCachedSpire } from '../../hooks/useCachedSpire'
import { useCachedStrimzi } from '../../hooks/useCachedStrimzi'
import { useCachedFlatcar } from '../../hooks/useCachedFlatcar'
import { useCachedTikv } from '../../hooks/useCachedTikv'
import { useCachedTuf } from '../../hooks/useCachedTuf'
import { useCachedCloudCustodian } from '../../hooks/useCachedCloudCustodian'
import { useCachedVitess } from '../../hooks/useCachedVitess'
import { useCachedWasmcloud } from '../../hooks/useCachedWasmcloud'
import { useCachedVolcano } from '../../hooks/useCachedVolcano'

const THIRTY_SECONDS_MS = 30 * MS_PER_SECOND
const TWO_MINUTES_MS = 2 * MS_PER_MINUTE
const THREE_MINUTES_MS = 3 * MS_PER_MINUTE
const FOUR_MINUTES_MS = 4 * MS_PER_MINUTE
const FIVE_MINUTES_MS = 5 * MS_PER_MINUTE
const TEN_MINUTES_MS = 10 * MS_PER_MINUTE
const FIFTEEN_MINUTES_MS = 15 * MS_PER_MINUTE
const THIRTY_MINUTES_MS = 30 * MS_PER_MINUTE
const FORTY_FIVE_MINUTES_MS = 45 * MS_PER_MINUTE
const TWO_HOURS_MS = 2 * MS_PER_HOUR
const THREE_HOURS_MS = 3 * MS_PER_HOUR
const TWO_DAYS_MS = 2 * MS_PER_DAY
const THREE_DAYS_MS = 3 * MS_PER_DAY

// ============================================================================
// Wrapper hooks that convert params object to positional args
// These are React hooks that can be safely registered
// ============================================================================

type ResourceArity = 'none' | 'cluster' | 'cluster+namespace'

type UnifiedHookResult<TData, TExtra extends Record<string, unknown> = Record<string, never>> = {
  data: TData
  isLoading: boolean
  error: Error | null
  refetch: () => void | Promise<void>
} & TExtra

type HookResultBase = {
  isLoading: boolean
  error?: string | Error | null
  refetch?: () => void | Promise<void>
} & Record<string, unknown>

function normalizeHookError(errorValue: unknown, fallbackMessage?: string): Error | null {
  if (errorValue instanceof Error) return errorValue
  if (typeof errorValue === 'string') return new Error(errorValue)
  if (!errorValue) return null
  return new Error(fallbackMessage ?? 'Failed to fetch data')
}

interface ResourceHookConfig<
  TResult extends HookResultBase,
  TDataField extends keyof TResult,
  TExtra extends Record<string, unknown> = Record<string, never>,
> {
  useHook: (...args: unknown[]) => TResult
  dataField: TDataField
  arity: ResourceArity
  extra?: (result: TResult) => TExtra
  nullGuard?: boolean
}

function createUnifiedResourceHook<
  TResult extends HookResultBase,
  TDataField extends keyof TResult,
  TExtra extends Record<string, unknown> = Record<string, never>,
>(config: ResourceHookConfig<TResult, TDataField, TExtra>) {
  return function useUnifiedResourceInstance(
    params?: Record<string, unknown>
  ): UnifiedHookResult<TResult[TDataField], TExtra> {
    const cluster = config.arity !== 'none' ? params?.cluster as string | undefined : undefined
    const namespace = config.arity === 'cluster+namespace' ? params?.namespace as string | undefined : undefined
    const args: unknown[] = []

    if (config.arity === 'cluster' || config.arity === 'cluster+namespace') {
      args.push(cluster)
    }

    if (config.arity === 'cluster+namespace') {
      args.push(namespace)
    }

    const result = config.useHook(...args)
    const rawData = result[config.dataField]
    const data = config.nullGuard ? (rawData ?? []) as TResult[TDataField] : rawData

    return {
      data,
      isLoading: result.isLoading,
      error: normalizeHookError(result.error),
      refetch: result.refetch ?? (() => {}),
      ...(config.extra ? config.extra(result) : {}),
    }
  }
}

const useUnifiedPodIssues = createUnifiedResourceHook({ useHook: useCachedPodIssues, dataField: 'data', arity: 'cluster+namespace' })
const useUnifiedEvents = createUnifiedResourceHook({ useHook: useCachedEvents, dataField: 'data', arity: 'cluster+namespace' })
const useUnifiedDeployments = createUnifiedResourceHook({ useHook: useCachedDeployments, dataField: 'data', arity: 'cluster+namespace' })
const useUnifiedClusters = createUnifiedResourceHook({ useHook: useClusters, dataField: 'clusters', arity: 'none' })
const useUnifiedPVCs = createUnifiedResourceHook({ useHook: usePVCs, dataField: 'pvcs', arity: 'cluster+namespace' })
const useUnifiedServices = createUnifiedResourceHook({ useHook: useServices, dataField: 'services', arity: 'cluster+namespace' })
const useUnifiedDeploymentIssues = createUnifiedResourceHook({ useHook: useCachedDeploymentIssues, dataField: 'issues', arity: 'cluster+namespace', nullGuard: true })
const useUnifiedOperators = createUnifiedResourceHook({ useHook: useOperators, dataField: 'operators', arity: 'cluster' })
const useUnifiedHelmReleases = createUnifiedResourceHook({ useHook: useHelmReleases, dataField: 'releases', arity: 'cluster' })
const useUnifiedConfigMaps = createUnifiedResourceHook({ useHook: useConfigMaps, dataField: 'configmaps', arity: 'cluster+namespace' })
const useUnifiedSecrets = createUnifiedResourceHook({ useHook: useSecrets, dataField: 'secrets', arity: 'cluster+namespace' })
const useUnifiedIngresses = createUnifiedResourceHook({
  useHook: useIngresses,
  dataField: 'ingresses',
  arity: 'cluster+namespace',
  extra: (result) => ({ isDemoData: result.isDemoFallback }),
})
const useUnifiedNodes = createUnifiedResourceHook({ useHook: useNodes, dataField: 'nodes', arity: 'cluster' })
const useUnifiedJobs = createUnifiedResourceHook({ useHook: useJobs, dataField: 'jobs', arity: 'cluster+namespace' })
const useUnifiedCronJobs = createUnifiedResourceHook({ useHook: useCronJobs, dataField: 'cronJobs', arity: 'cluster+namespace' })
const useUnifiedStatefulSets = createUnifiedResourceHook({ useHook: useStatefulSets, dataField: 'statefulSets', arity: 'cluster+namespace' })
const useUnifiedDaemonSets = createUnifiedResourceHook({ useHook: useDaemonSets, dataField: 'daemonSets', arity: 'cluster+namespace' })
const useUnifiedHPAs = createUnifiedResourceHook({ useHook: useHPAs, dataField: 'hpas', arity: 'cluster+namespace' })
const useUnifiedReplicaSets = createUnifiedResourceHook({ useHook: useReplicaSets, dataField: 'replicaSets', arity: 'cluster+namespace' })
const useUnifiedPVs = createUnifiedResourceHook({ useHook: usePVs, dataField: 'pvs', arity: 'cluster' })
const useUnifiedResourceQuotas = createUnifiedResourceHook({
  useHook: useResourceQuotas,
  dataField: 'resourceQuotas',
  arity: 'cluster+namespace',
  extra: (result) => ({ isDemoData: result.isDemoFallback }),
})
const useUnifiedLimitRanges = createUnifiedResourceHook({ useHook: useLimitRanges, dataField: 'limitRanges', arity: 'cluster+namespace' })
const useUnifiedNetworkPolicies = createUnifiedResourceHook({ useHook: useNetworkPolicies, dataField: 'networkpolicies', arity: 'cluster+namespace' })
const useUnifiedNamespaces = createUnifiedResourceHook({ useHook: useNamespaces, dataField: 'namespaces', arity: 'cluster' })
const useUnifiedOperatorSubscriptions = createUnifiedResourceHook({ useHook: useOperatorSubscriptions, dataField: 'subscriptions', arity: 'cluster' })
const useUnifiedServiceAccounts = createUnifiedResourceHook({ useHook: useServiceAccounts, dataField: 'serviceAccounts', arity: 'cluster+namespace' })
const useUnifiedK8sRoles = createUnifiedResourceHook({ useHook: useK8sRoles, dataField: 'roles', arity: 'cluster+namespace' })
const useUnifiedK8sRoleBindings = createUnifiedResourceHook({ useHook: useK8sRoleBindings, dataField: 'bindings', arity: 'cluster+namespace' })
const useUnifiedServiceExports = createUnifiedResourceHook({ useHook: useServiceExports, dataField: 'exports', arity: 'cluster+namespace' })
const useUnifiedServiceImports = createUnifiedResourceHook({ useHook: useServiceImports, dataField: 'imports', arity: 'cluster+namespace' })

// ============================================================================
// Demo data hooks for cards that don't have real data hooks yet
// These return static demo data for visualization purposes
// ============================================================================

function useDemoDataHook<T>(demoData: T[]) {
  const { isDemoMode: demoMode } = useDemoMode()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!demoMode) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const timer = setTimeout(() => setIsLoading(false), SHORT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [demoMode])

  return {
    data: !demoMode ? [] : isLoading ? [] : demoData,
    isLoading,
    error: null,
    refetch: () => {} }
}

// Cluster metrics demo data
const DEMO_CLUSTER_METRICS = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, cpu: 45, memory: 62, pods: 156 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, cpu: 48, memory: 64, pods: 158 },
  { timestamp: Date.now() - THREE_MINUTES_MS, cpu: 42, memory: 61, pods: 155 },
  { timestamp: Date.now() - TWO_MINUTES_MS, cpu: 51, memory: 67, pods: 162 },
  { timestamp: Date.now() - MS_PER_MINUTE, cpu: 47, memory: 65, pods: 159 },
  { timestamp: Date.now(), cpu: 49, memory: 66, pods: 161 },
]

// Resource usage demo data
const DEMO_RESOURCE_USAGE = [
  { cluster: 'prod-east', cpu: 72, memory: 68, storage: 45 },
  { cluster: 'staging', cpu: 35, memory: 42, storage: 28 },
  { cluster: 'dev', cpu: 15, memory: 22, storage: 12 },
]

// Events timeline demo data
const DEMO_EVENTS_TIMELINE = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, count: 12, type: 'Normal' },
  { timestamp: Date.now() - FOUR_MINUTES_MS, count: 8, type: 'Warning' },
  { timestamp: Date.now() - THREE_MINUTES_MS, count: 15, type: 'Normal' },
  { timestamp: Date.now() - TWO_MINUTES_MS, count: 5, type: 'Warning' },
  { timestamp: Date.now() - MS_PER_MINUTE, count: 10, type: 'Normal' },
  { timestamp: Date.now(), count: 7, type: 'Warning' },
]

// Security issues demo data
const DEMO_SECURITY_ISSUES = [
  { id: '1', severity: 'high', title: 'Pod running as root', cluster: 'prod-east', namespace: 'default' },
  { id: '2', severity: 'medium', title: 'Missing network policy', cluster: 'staging', namespace: 'apps' },
  { id: '3', severity: 'low', title: 'Deprecated API version', cluster: 'dev', namespace: 'test' },
]

// Active alerts demo data
const DEMO_ACTIVE_ALERTS = [
  { id: '1', severity: 'critical', name: 'HighCPUUsage', cluster: 'prod-east', message: 'CPU > 90% for 5m' },
  { id: '2', severity: 'warning', name: 'PodCrashLooping', cluster: 'staging', message: 'Pod restarting frequently' },
]

// Storage overview demo data
const DEMO_STORAGE_OVERVIEW = {
  totalCapacity: 2048,
  used: 1234,
  pvcs: 45,
  unbound: 3 }

// Network overview demo data
const DEMO_NETWORK_OVERVIEW = {
  services: 67,
  ingresses: 12,
  networkPolicies: 23,
  loadBalancers: 5 }

// Top pods demo data
const DEMO_TOP_PODS = [
  { name: 'api-server-7d8f9c', namespace: 'production', cpu: 850, memory: 1024, cluster: 'prod-east' },
  { name: 'ml-worker-5c6d7e', namespace: 'ml-workloads', cpu: 3200, memory: 8192, cluster: 'vllm-d' },
  { name: 'cache-redis-0', namespace: 'data', cpu: 120, memory: 512, cluster: 'staging' },
]

// GitOps drift demo data
const DEMO_GITOPS_DRIFT = [
  { app: 'frontend', status: 'synced', cluster: 'prod-east', lastSync: Date.now() - MS_PER_MINUTE },
  { app: 'backend', status: 'drifted', cluster: 'staging', lastSync: Date.now() - FIVE_MINUTES_MS },
  { app: 'monitoring', status: 'synced', cluster: 'dev', lastSync: Date.now() - TWO_MINUTES_MS },
]

// Pod health trend demo data
const DEMO_POD_HEALTH_TREND = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, healthy: 145, unhealthy: 3 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, healthy: 148, unhealthy: 2 },
  { timestamp: Date.now() - THREE_MINUTES_MS, healthy: 142, unhealthy: 5 },
  { timestamp: Date.now() - TWO_MINUTES_MS, healthy: 150, unhealthy: 1 },
  { timestamp: Date.now() - MS_PER_MINUTE, healthy: 147, unhealthy: 4 },
  { timestamp: Date.now(), healthy: 149, unhealthy: 2 },
]

// Resource trend demo data
const DEMO_RESOURCE_TREND = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, cpu: 45, memory: 62 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, cpu: 52, memory: 65 },
  { timestamp: Date.now() - THREE_MINUTES_MS, cpu: 48, memory: 58 },
  { timestamp: Date.now() - TWO_MINUTES_MS, cpu: 55, memory: 70 },
  { timestamp: Date.now() - MS_PER_MINUTE, cpu: 50, memory: 67 },
  { timestamp: Date.now(), cpu: 53, memory: 64 },
]

// Compute overview demo data
const DEMO_COMPUTE_OVERVIEW = {
  nodes: 12,
  cpuUsage: 48,
  memoryUsage: 62,
  podCount: 156 }

// ============================================================================
// Batch 4 demo data - ArgoCD, Prow, GPU, ML, Policy cards
// ============================================================================

// ArgoCD applications demo data
const DEMO_ARGOCD_APPLICATIONS = [
  { name: 'frontend-app', project: 'production', syncStatus: 'Synced', healthStatus: 'Healthy', namespace: 'apps' },
  { name: 'backend-api', project: 'production', syncStatus: 'OutOfSync', healthStatus: 'Progressing', namespace: 'apps' },
  { name: 'monitoring', project: 'infra', syncStatus: 'Synced', healthStatus: 'Healthy', namespace: 'monitoring' },
]

// GPU inventory demo data
const DEMO_GPU_INVENTORY = [
  { cluster: 'vllm-d', node: 'gpu-node-1', model: 'NVIDIA A100 80GB', memory: 85899345920, utilization: 72 },
  { cluster: 'vllm-d', node: 'gpu-node-2', model: 'NVIDIA A100 80GB', memory: 85899345920, utilization: 85 },
  { cluster: 'ml-train', node: 'ml-worker-1', model: 'NVIDIA H100', memory: 85899345920, utilization: 45 },
]

// Prow jobs demo data
const DEMO_PROW_JOBS = [
  { name: 'pull-kubestellar-verify', type: 'presubmit', state: 'success', startTime: Date.now() - TWO_MINUTES_MS },
  { name: 'periodic-e2e-tests', type: 'periodic', state: 'pending', startTime: Date.now() - MS_PER_MINUTE },
  { name: 'post-kubestellar-deploy', type: 'postsubmit', state: 'failure', startTime: Date.now() - FIVE_MINUTES_MS },
]

// ML jobs demo data
const DEMO_ML_JOBS = [
  { name: 'train-llm-v2', namespace: 'ml-workloads', status: 'Running', progress: 75, cluster: 'ml-train' },
  { name: 'fine-tune-bert', namespace: 'ml-workloads', status: 'Completed', progress: 100, cluster: 'ml-train' },
  { name: 'eval-model-v3', namespace: 'ml-eval', status: 'Pending', progress: 0, cluster: 'vllm-d' },
]

// ML notebooks demo data
const DEMO_ML_NOTEBOOKS = [
  { name: 'data-exploration', namespace: 'ml-notebooks', status: 'Running', user: 'data-scientist', cluster: 'ml-train' },
  { name: 'model-analysis', namespace: 'ml-notebooks', status: 'Stopped', user: 'ml-engineer', cluster: 'ml-train' },
]

// OPA policies demo data
const DEMO_OPA_POLICIES = [
  { name: 'require-labels', namespace: 'gatekeeper-system', status: 'active', violations: 3, cluster: 'prod-east' },
  { name: 'deny-privileged', namespace: 'gatekeeper-system', status: 'active', violations: 0, cluster: 'prod-east' },
  { name: 'require-requests', namespace: 'gatekeeper-system', status: 'warn', violations: 12, cluster: 'staging' },
]

// Kyverno policies demo data
const DEMO_KYVERNO_POLICIES = [
  { name: 'require-image-tag', namespace: 'kyverno', status: 'enforce', violations: 2, cluster: 'prod-east' },
  { name: 'disallow-latest', namespace: 'kyverno', status: 'audit', violations: 5, cluster: 'staging' },
]

// Alert rules demo data
const DEMO_ALERT_RULES = [
  { name: 'HighCPUUsage', severity: 'warning', state: 'firing', group: 'kubernetes', cluster: 'prod-east' },
  { name: 'PodCrashLooping', severity: 'critical', state: 'pending', group: 'kubernetes', cluster: 'staging' },
  { name: 'NodeNotReady', severity: 'critical', state: 'inactive', group: 'nodes', cluster: 'dev' },
]

// Chart versions demo data
const DEMO_CHART_VERSIONS = [
  { chart: 'nginx-ingress', current: '4.6.0', latest: '4.8.0', updateAvailable: true, cluster: 'prod-east' },
  { chart: 'cert-manager', current: '1.12.0', latest: '1.12.0', updateAvailable: false, cluster: 'prod-east' },
  { chart: 'prometheus', current: '45.0.0', latest: '47.0.0', updateAvailable: true, cluster: 'monitoring' },
]

// CRD health demo data
const DEMO_CRD_HEALTH = [
  { name: 'applications.argoproj.io', version: 'v1alpha1', status: 'healthy', instances: 15, cluster: 'prod-east' },
  { name: 'certificates.cert-manager.io', version: 'v1', status: 'healthy', instances: 8, cluster: 'prod-east' },
  { name: 'inferencepools.llm.kubestellar.io', version: 'v1', status: 'degraded', instances: 2, cluster: 'vllm-d' },
]

// Compliance score demo data
const DEMO_COMPLIANCE_SCORE = {
  overall: 85,
  categories: [
    { name: 'Security', score: 92, passed: 46, failed: 4 },
    { name: 'Reliability', score: 78, passed: 39, failed: 11 },
    { name: 'Best Practices', score: 85, passed: 68, failed: 12 },
  ] }

// Namespace events demo data
const DEMO_NAMESPACE_EVENTS = [
  { type: 'Normal', reason: 'Scheduled', message: 'Pod scheduled', object: 'pod/api-7d8f', namespace: 'production', count: 1, lastSeen: Date.now() - THIRTY_SECONDS_MS },
  { type: 'Warning', reason: 'BackOff', message: 'Container restarting', object: 'pod/worker-5c6d', namespace: 'production', count: 5, lastSeen: Date.now() - MS_PER_MINUTE },
]

// GPU workloads demo data
const DEMO_GPU_WORKLOADS = [
  { name: 'llm-inference-7d8f', namespace: 'ml-serving', gpus: 4, model: 'A100', utilization: 85, cluster: 'vllm-d' },
  { name: 'training-job-5c6d', namespace: 'ml-training', gpus: 8, model: 'H100', utilization: 92, cluster: 'ml-train' },
]

// Deployment progress demo data
const DEMO_DEPLOYMENT_PROGRESS = [
  { name: 'api-server', namespace: 'production', replicas: 5, ready: 5, progress: 100, status: 'complete' },
  { name: 'worker', namespace: 'production', replicas: 10, ready: 7, progress: 70, status: 'progressing' },
]

// ============================================================================
// Batch 5 demo data - GitOps, Security, Status cards
// ============================================================================

// ArgoCD health demo data (stats-grid)
const DEMO_ARGOCD_HEALTH = {
  healthy: 12,
  degraded: 2,
  progressing: 1,
  missing: 0 }

// ArgoCD sync status demo data (stats-grid)
const DEMO_ARGOCD_SYNC_STATUS = {
  synced: 11,
  outOfSync: 3,
  unknown: 1 }

// Gateway status demo data
const DEMO_GATEWAY_STATUS = [
  { name: 'api-gateway', class: 'istio', addresses: 2, status: 'Programmed', cluster: 'prod-east' },
  { name: 'internal-gw', class: 'nginx', addresses: 1, status: 'Programmed', cluster: 'staging' },
]

// Kustomization status demo data
const DEMO_KUSTOMIZATION_STATUS = [
  { name: 'apps', namespace: 'flux-system', ready: true, lastApplied: Date.now() - TWO_MINUTES_MS },
  { name: 'infra', namespace: 'flux-system', ready: true, lastApplied: Date.now() - FIVE_MINUTES_MS },
  { name: 'monitoring', namespace: 'flux-system', ready: false, lastApplied: Date.now() - TEN_MINUTES_MS },
]

// Provider health demo data
const DEMO_PROVIDER_HEALTH = [
  { provider: 'AWS', type: 'cloud', status: 'healthy', latency: 45 },
  { provider: 'OpenAI', type: 'ai', status: 'healthy', latency: 120 },
  { provider: 'Azure', type: 'cloud', status: 'degraded', latency: 250 },
]

// Upgrade status demo data
const DEMO_UPGRADE_STATUS = [
  { cluster: 'prod-east', currentVersion: '1.28.5', availableVersion: '1.29.2', status: 'available' },
  { cluster: 'staging', currentVersion: '1.29.1', availableVersion: '1.29.2', status: 'available' },
  { cluster: 'dev', currentVersion: '1.29.2', availableVersion: '1.29.2', status: 'current' },
]

// Prow status demo data (stats-grid)
const DEMO_PROW_STATUS = {
  running: 5,
  passed: 42,
  failed: 3,
  pending: 2 }

// Prow history demo data
const DEMO_PROW_HISTORY = [
  { job: 'e2e-tests', result: 'success', duration: 1200, finishedAt: Date.now() - MS_PER_HOUR },
  { job: 'unit-tests', result: 'success', duration: 300, finishedAt: Date.now() - TWO_HOURS_MS },
  { job: 'lint', result: 'failure', duration: 60, finishedAt: Date.now() - THREE_HOURS_MS },
]

// Helm history demo data
const DEMO_HELM_HISTORY = [
  { revision: 5, chart: 'nginx-ingress-4.6.0', appVersion: '1.9.0', status: 'deployed', updated: Date.now() - MS_PER_DAY },
  { revision: 4, chart: 'nginx-ingress-4.5.2', appVersion: '1.8.0', status: 'superseded', updated: Date.now() - TWO_DAYS_MS },
]

// External secrets demo data (stats-grid)
const DEMO_EXTERNAL_SECRETS = {
  total: 25,
  ready: 23,
  failed: 2 }

// Cert manager demo data (stats-grid)
const DEMO_CERT_MANAGER = {
  certificates: 15,
  ready: 14,
  expiringSoon: 1,
  expired: 0 }

// Vault secrets demo data
const DEMO_VAULT_SECRETS = [
  { path: 'secret/data/api-keys', status: 'synced', lastSync: Date.now() - MS_PER_MINUTE },
  { path: 'secret/data/db-creds', status: 'synced', lastSync: Date.now() - TWO_MINUTES_MS },
]

// Falco alerts demo data
const DEMO_FALCO_ALERTS = [
  { rule: 'Terminal shell in container', severity: 'Warning', count: 3, lastSeen: Date.now() - FIVE_MINUTES_MS },
  { rule: 'Sensitive file read', severity: 'Notice', count: 12, lastSeen: Date.now() - TEN_MINUTES_MS },
]

// Kubescape scan demo data (stats-grid)
const DEMO_KUBESCAPE_SCAN = {
  passed: 85,
  failed: 12,
  skipped: 3,
  riskScore: 22 }

// Trivy scan demo data (stats-grid)
const DEMO_TRIVY_SCAN = {
  critical: 2,
  high: 8,
  medium: 25,
  low: 45 }

// Event summary demo data (stats-grid)
const DEMO_EVENT_SUMMARY = {
  normal: 156,
  warning: 23,
  error: 5 }

// App status demo data
const DEMO_APP_STATUS = [
  { name: 'frontend', namespace: 'production', status: 'healthy', pods: 3, cluster: 'prod-east' },
  { name: 'backend', namespace: 'production', status: 'degraded', pods: 5, cluster: 'prod-east' },
]

// GPU status demo data (stats-grid)
const DEMO_GPU_STATUS = {
  total: 24,
  available: 6,
  allocated: 18,
  errored: 0 }

// GPU utilization demo data (chart)
const DEMO_GPU_UTILIZATION = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, utilization: 72, memory: 68 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, utilization: 78, memory: 72 },
  { timestamp: Date.now() - THREE_MINUTES_MS, utilization: 65, memory: 60 },
  { timestamp: Date.now() - TWO_MINUTES_MS, utilization: 82, memory: 78 },
  { timestamp: Date.now() - MS_PER_MINUTE, utilization: 75, memory: 70 },
  { timestamp: Date.now(), utilization: 80, memory: 74 },
]

// GPU usage trend demo data (chart)
const DEMO_GPU_USAGE_TREND = [
  { timestamp: Date.now() - MS_PER_HOUR, avgUtilization: 68 },
  { timestamp: Date.now() - FORTY_FIVE_MINUTES_MS, avgUtilization: 72 },
  { timestamp: Date.now() - THIRTY_MINUTES_MS, avgUtilization: 78 },
  { timestamp: Date.now() - FIFTEEN_MINUTES_MS, avgUtilization: 74 },
  { timestamp: Date.now(), avgUtilization: 76 },
]

// Policy violations demo data
const DEMO_POLICY_VIOLATIONS = [
  { policy: 'require-labels', resource: 'deployment/api', namespace: 'default', severity: 'warning', cluster: 'prod-east' },
  { policy: 'deny-privileged', resource: 'pod/debug', namespace: 'kube-system', severity: 'critical', cluster: 'staging' },
]

// Namespace overview demo data (stats-grid)
const DEMO_NAMESPACE_OVERVIEW = {
  pods: 45,
  deployments: 12,
  services: 8,
  configmaps: 15 }

// Namespace quotas demo data
const DEMO_NAMESPACE_QUOTAS = [
  { namespace: 'production', cpuUsed: '4', cpuLimit: '8', memUsed: '8Gi', memLimit: '16Gi' },
  { namespace: 'staging', cpuUsed: '2', cpuLimit: '4', memUsed: '4Gi', memLimit: '8Gi' },
]

// Namespace RBAC demo data
const DEMO_NAMESPACE_RBAC = [
  { subject: 'developers', type: 'Group', role: 'edit', namespace: 'production' },
  { subject: 'ci-bot', type: 'ServiceAccount', role: 'admin', namespace: 'production' },
]

// Resource capacity demo data (stats-grid)
const DEMO_RESOURCE_CAPACITY = {
  cpuTotal: 96,
  cpuUsed: 48,
  memoryTotal: 384,
  memoryUsed: 256 }

// ============================================================================
// Batch 6 demo data - Remaining compatible cards
// ============================================================================

// GitHub activity demo data
const DEMO_GITHUB_ACTIVITY = [
  { type: 'PushEvent', repo: 'kubestellar/console', actor: 'developer1', timestamp: Date.now() - MS_PER_HOUR },
  { type: 'PullRequestEvent', repo: 'kubestellar/console', actor: 'developer2', timestamp: Date.now() - TWO_HOURS_MS },
  { type: 'IssuesEvent', repo: 'kubestellar/kubestellar', actor: 'contributor', timestamp: Date.now() - THREE_HOURS_MS },
]

// RSS feed demo data
const DEMO_RSS_FEED = [
  { title: 'Kubernetes 1.30 Released', source: 'k8s.io', pubDate: Date.now() - MS_PER_DAY },
  { title: 'New CNCF Project Announcement', source: 'cncf.io', pubDate: Date.now() - TWO_DAYS_MS },
  { title: 'Cloud Native Best Practices', source: 'blog.k8s.io', pubDate: Date.now() - THREE_DAYS_MS },
]

// Kubecost overview demo data (chart/donut)
const DEMO_KUBECOST_OVERVIEW = {
  totalCost: 12500,
  breakdown: [
    { category: 'Compute', cost: 7500 },
    { category: 'Storage', cost: 2500 },
    { category: 'Network', cost: 1500 },
    { category: 'Other', cost: 1000 },
  ] }

// OpenCost overview demo data
const DEMO_OPENCOST_OVERVIEW = {
  totalCost: 8500,
  breakdown: [
    { category: 'CPU', cost: 4500 },
    { category: 'Memory', cost: 2500 },
    { category: 'Storage', cost: 1000 },
    { category: 'GPU', cost: 500 },
  ] }

// Cluster costs demo data
const DEMO_CLUSTER_COSTS = [
  { cluster: 'prod-east', dailyCost: 450, monthlyCost: 13500, trend: 'up' },
  { cluster: 'staging', dailyCost: 120, monthlyCost: 3600, trend: 'stable' },
  { cluster: 'dev', dailyCost: 80, monthlyCost: 2400, trend: 'down' },
]

// ============================================================================
// Filtered event hooks
// These provide pre-filtered event data for specific card types
// ============================================================================

function useWarningEvents(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedEvents(cluster, namespace)

  // Filter to only warning events
  const warningEvents = (() => {
    if (!result.data) return []
    return result.data.filter(e => e.type === 'Warning')
  })()

  return {
    data: warningEvents,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() } }
}

function useRecentEvents(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedEvents(cluster, namespace)

  // Filter to events within the last hour
  const recentEvents = (() => {
    if (!result.data) return []
    const oneHourAgo = Date.now() - MS_PER_HOUR
    return result.data.filter(e => {
      if (!e.lastSeen) return false
      return new Date(e.lastSeen).getTime() >= oneHourAgo
    })
  })()

  return {
    data: recentEvents,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() } }
}

// Demo hook factories
function createDemoHook<T>(demoData: T[] | T) {
  return function useDemoHookInstance() {
    return useDemoDataHook(Array.isArray(demoData) ? demoData : [demoData])
  }
}

const useClusterMetrics = createDemoHook(DEMO_CLUSTER_METRICS)
const useResourceUsage = createDemoHook(DEMO_RESOURCE_USAGE)
const useEventsTimeline = createDemoHook(DEMO_EVENTS_TIMELINE)
const useSecurityIssues = createDemoHook(DEMO_SECURITY_ISSUES)
const useActiveAlerts = createDemoHook(DEMO_ACTIVE_ALERTS)
const useStorageOverview = createDemoHook(DEMO_STORAGE_OVERVIEW)
const useNetworkOverview = createDemoHook(DEMO_NETWORK_OVERVIEW)
const useTopPods = createDemoHook(DEMO_TOP_PODS)
const useGitOpsDrift = createDemoHook(DEMO_GITOPS_DRIFT)
const usePodHealthTrend = createDemoHook(DEMO_POD_HEALTH_TREND)
const useResourceTrend = createDemoHook(DEMO_RESOURCE_TREND)
const useComputeOverview = createDemoHook(DEMO_COMPUTE_OVERVIEW)

// ============================================================================
// Batch 4 demo hooks - ArgoCD, Prow, GPU, ML, Policy cards
// ============================================================================

const useArgoCDApplications = createDemoHook(DEMO_ARGOCD_APPLICATIONS)
const useGPUInventory = createDemoHook(DEMO_GPU_INVENTORY)
const useProwJobs = createDemoHook(DEMO_PROW_JOBS)
const useMLJobs = createDemoHook(DEMO_ML_JOBS)
const useMLNotebooks = createDemoHook(DEMO_ML_NOTEBOOKS)
const useOPAPolicies = createDemoHook(DEMO_OPA_POLICIES)
const useKyvernoPolicies = createDemoHook(DEMO_KYVERNO_POLICIES)
const useAlertRules = createDemoHook(DEMO_ALERT_RULES)
const useChartVersions = createDemoHook(DEMO_CHART_VERSIONS)
const useCRDHealth = createDemoHook(DEMO_CRD_HEALTH)
const useComplianceScore = createDemoHook(DEMO_COMPLIANCE_SCORE)

/** Maximum namespace events to return when no namespace filter is set */
const MAX_NAMESPACE_EVENTS_UNFILTERED = 20

function useNamespaceEvents(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedEvents(cluster, namespace)

  // Filter to specific namespace if provided
  const namespaceEvents = (() => {
    if (!result.data) return []
    if (!namespace) return result.data.slice(0, MAX_NAMESPACE_EVENTS_UNFILTERED)
    return result.data.filter(e => e.namespace === namespace)
  })()

  return {
    data: namespaceEvents.length > 0 ? namespaceEvents : DEMO_NAMESPACE_EVENTS,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() } }
}

const useGPUWorkloads = createDemoHook(DEMO_GPU_WORKLOADS)
const useDeploymentProgress = createDemoHook(DEMO_DEPLOYMENT_PROGRESS)

// ============================================================================
// Batch 5 demo hooks - GitOps, Security, Status cards
// ============================================================================

const useArgoCDHealth = createDemoHook(DEMO_ARGOCD_HEALTH)
const useArgoCDSyncStatus = createDemoHook(DEMO_ARGOCD_SYNC_STATUS)
const useGatewayStatus = createDemoHook(DEMO_GATEWAY_STATUS)
const useKustomizationStatus = createDemoHook(DEMO_KUSTOMIZATION_STATUS)

function useUnifiedFluxStatus() {
  const result = useFluxStatus()
  const data = [
    ...result.data.resources.sources,
    ...result.data.resources.kustomizations,
    ...result.data.resources.helmReleases,
  ]

  return {
    data,
    isLoading: result.showSkeleton,
    error: result.error ? new Error('Failed to fetch Flux status') : null,
    refetch: () => {},
  }
}

function useUnifiedContourStatus() {
  const result = useContourStatus()
  return {
    data: result.data.proxies,
    isLoading: result.showSkeleton,
    error: result.error ? new Error('Failed to fetch Contour status') : null,
    refetch: () => {},
  }
}

function useUnifiedChaosMeshStatus() {
  const result = useChaosMeshStatus()
  return {
    data: result.data,
    isLoading: result.showSkeleton,
    error: result.error ? new Error('Failed to fetch Chaos Mesh status') : null,
    refetch: () => { void result.refetch() },
  }
}

interface CachedHookConfig<
  TResult extends {
    data?: Record<string, unknown>
    isLoading?: boolean
    showSkeleton?: boolean
    isFailed?: boolean
    error?: unknown
    refetch?: () => void | Promise<void>
  },
> {
  useCachedHook: () => TResult
  dataField: string
  errorMsg?: string
  loadingField: 'isLoading' | 'showSkeleton'
  errorField: 'isFailed' | 'error'
  nullGuard?: boolean
}

function createUnifiedCachedHook<
  TResult extends {
    data?: Record<string, unknown>
    isLoading?: boolean
    showSkeleton?: boolean
    isFailed?: boolean
    error?: unknown
    refetch?: () => void | Promise<void>
  },
>(config: CachedHookConfig<TResult>) {
  return function useUnifiedCachedInstance() {
    const result = config.useCachedHook()
    const rawData = result.data?.[config.dataField]
    const data = config.nullGuard ? rawData ?? [] : rawData
    const isLoading = config.loadingField === 'showSkeleton'
      ? Boolean(result.showSkeleton)
      : Boolean(result.isLoading)

    let error: Error | null = null

    if (config.errorField === 'isFailed') {
      error = result.isFailed ? new Error(config.errorMsg ?? 'Failed to fetch status') : null
    } else if (result.error) {
      error = config.errorMsg ? new Error(config.errorMsg) : normalizeHookError(result.error)
    }

    return {
      data,
      isLoading,
      error,
      refetch: () => { void result.refetch?.() },
    }
  }
}

const useUnifiedBackstageStatus = createUnifiedCachedHook({ useCachedHook: useCachedBackstage, dataField: 'plugins', loadingField: 'isLoading', errorField: 'error' })
const useUnifiedContainerdStatus = createUnifiedCachedHook({ useCachedHook: useCachedContainerd, dataField: 'containers', loadingField: 'isLoading', errorField: 'isFailed', errorMsg: 'Failed to fetch containerd status' })
const useUnifiedCortexStatus = createUnifiedCachedHook({ useCachedHook: useCachedCortex, dataField: 'components', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch Cortex status' })
const useUnifiedDaprStatus = createUnifiedCachedHook({ useCachedHook: useCachedDapr, dataField: 'components', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch Dapr status' })
const useUnifiedDragonflyStatus = createUnifiedCachedHook({ useCachedHook: useCachedDragonfly, dataField: 'components', loadingField: 'isLoading', errorField: 'isFailed', errorMsg: 'Failed to fetch Dragonfly status' })
const useUnifiedEnvoyStatus = createUnifiedCachedHook({ useCachedHook: useCachedEnvoy, dataField: 'listeners', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch Envoy status' })
const useUnifiedGrpcStatus = createUnifiedCachedHook({ useCachedHook: useCachedGrpc, dataField: 'services', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch gRPC status' })
const useUnifiedKedaStatus = createUnifiedCachedHook({ useCachedHook: useCachedKeda, dataField: 'scaledObjects', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch KEDA status', nullGuard: true })
const useUnifiedKserveStatus = createUnifiedCachedHook({ useCachedHook: useCachedKserve, dataField: 'services', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch KServe status', nullGuard: true })
const useUnifiedLinkerdStatus = createUnifiedCachedHook({ useCachedHook: useCachedLinkerd, dataField: 'deployments', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch Linkerd status' })
const useUnifiedLonghornStatus = createUnifiedCachedHook({ useCachedHook: useCachedLonghorn, dataField: 'volumes', loadingField: 'isLoading', errorField: 'error' })
const useUnifiedOtelStatus = createUnifiedCachedHook({ useCachedHook: useCachedOtel, dataField: 'collectors', loadingField: 'isLoading', errorField: 'error' })
const useUnifiedTikvStatus = createUnifiedCachedHook({ useCachedHook: useCachedTikv, dataField: 'stores', loadingField: 'isLoading', errorField: 'error' })
const useUnifiedTufStatus = createUnifiedCachedHook({ useCachedHook: useCachedTuf, dataField: 'roles', loadingField: 'isLoading', errorField: 'error' })
const useUnifiedCloudCustodianStatus = createUnifiedCachedHook({ useCachedHook: useCachedCloudCustodian, dataField: 'policies', loadingField: 'isLoading', errorField: 'error' })
const useUnifiedRookStatus = createUnifiedCachedHook({ useCachedHook: useCachedRook, dataField: 'clusters', loadingField: 'isLoading', errorField: 'error' })
const useUnifiedSpiffeStatus = createUnifiedCachedHook({ useCachedHook: useCachedSpiffe, dataField: 'entries', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch SPIFFE status' })
const useUnifiedCniStatus = createUnifiedCachedHook({ useCachedHook: useCachedCni, dataField: 'nodes', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch CNI status' })
const useUnifiedOpenfeatureStatus = createUnifiedCachedHook({ useCachedHook: useCachedOpenfeature, dataField: 'flags', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch OpenFeature status' })
const useUnifiedStrimziStatus = createUnifiedCachedHook({ useCachedHook: useCachedStrimzi, dataField: 'clusters', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch Strimzi status' })
const useUnifiedSpireStatus = createUnifiedCachedHook({ useCachedHook: useCachedSpire, dataField: 'serverPods', loadingField: 'isLoading', errorField: 'error' })
const useUnifiedOpenfgaStatus = createUnifiedCachedHook({ useCachedHook: useCachedOpenfga, dataField: 'stores', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch OpenFGA status' })
const useUnifiedKubeVelaStatus = createUnifiedCachedHook({ useCachedHook: useCachedKubevela, dataField: 'applications', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch KubeVela status' })
const useUnifiedFlatcarStatus = createUnifiedCachedHook({ useCachedHook: useCachedFlatcar, dataField: 'nodes', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch Flatcar status' })
const useUnifiedVitessStatus = createUnifiedCachedHook({ useCachedHook: useCachedVitess, dataField: 'keyspaces', loadingField: 'isLoading', errorField: 'error' })
const useUnifiedWasmcloudStatus = createUnifiedCachedHook({ useCachedHook: useCachedWasmcloud, dataField: 'hosts', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch wasmCloud status' })
const useUnifiedVolcanoStatus = createUnifiedCachedHook({ useCachedHook: useCachedVolcano, dataField: 'jobs', loadingField: 'showSkeleton', errorField: 'error', errorMsg: 'Failed to fetch Volcano status' })

const useProviderHealth = createDemoHook(DEMO_PROVIDER_HEALTH)
const useUpgradeStatus = createDemoHook(DEMO_UPGRADE_STATUS)
const useProwStatus = createDemoHook(DEMO_PROW_STATUS)
const useProwHistory = createDemoHook(DEMO_PROW_HISTORY)
const useHelmHistory = createDemoHook(DEMO_HELM_HISTORY)
const useExternalSecrets = createDemoHook(DEMO_EXTERNAL_SECRETS)
const useCertManager = createDemoHook(DEMO_CERT_MANAGER)
const useVaultSecrets = createDemoHook(DEMO_VAULT_SECRETS)
const useFalcoAlerts = createDemoHook(DEMO_FALCO_ALERTS)
const useKubescapeScan = createDemoHook(DEMO_KUBESCAPE_SCAN)
const useTrivyScan = createDemoHook(DEMO_TRIVY_SCAN)
const useEventSummary = createDemoHook(DEMO_EVENT_SUMMARY)
const useAppStatus = createDemoHook(DEMO_APP_STATUS)
const useGPUStatus = createDemoHook(DEMO_GPU_STATUS)
const useGPUUtilization = createDemoHook(DEMO_GPU_UTILIZATION)
const useGPUUsageTrend = createDemoHook(DEMO_GPU_USAGE_TREND)
const usePolicyViolations = createDemoHook(DEMO_POLICY_VIOLATIONS)
const useNamespaceOverview = createDemoHook(DEMO_NAMESPACE_OVERVIEW)
const useNamespaceQuotas = createDemoHook(DEMO_NAMESPACE_QUOTAS)
const useNamespaceRBAC = createDemoHook(DEMO_NAMESPACE_RBAC)
const useResourceCapacity = createDemoHook(DEMO_RESOURCE_CAPACITY)

// ============================================================================
// Batch 6 demo hooks - Remaining compatible cards
// ============================================================================

const useGithubActivity = createDemoHook(DEMO_GITHUB_ACTIVITY)
const useRSSFeed = createDemoHook(DEMO_RSS_FEED)
const useKubecostOverview = createDemoHook(DEMO_KUBECOST_OVERVIEW)
const useOpencostOverview = createDemoHook(DEMO_OPENCOST_OVERVIEW)
const useClusterCosts = createDemoHook(DEMO_CLUSTER_COSTS)

// ============================================================================
// Register all data hooks for use in unified cards
// Call this once at application startup
// ============================================================================

export function registerUnifiedHooks(): void {
  // Real data hooks (wrapped to match unified interface)
  registerDataHook('useCachedPodIssues', useUnifiedPodIssues)
  registerDataHook('useCachedEvents', useUnifiedEvents)
  registerDataHook('useCachedDeployments', useUnifiedDeployments)
  registerDataHook('useClusters', useUnifiedClusters)
  registerDataHook('usePVCs', useUnifiedPVCs)
  registerDataHook('useServices', useUnifiedServices)
  registerDataHook('useCachedDeploymentIssues', useUnifiedDeploymentIssues)
  registerDataHook('useOperators', useUnifiedOperators)
  registerDataHook('useHelmReleases', useUnifiedHelmReleases)
  registerDataHook('useConfigMaps', useUnifiedConfigMaps)
  registerDataHook('useSecrets', useUnifiedSecrets)
  registerDataHook('useIngresses', useUnifiedIngresses)
  registerDataHook('useNodes', useUnifiedNodes)
  registerDataHook('useJobs', useUnifiedJobs)
  registerDataHook('useCronJobs', useUnifiedCronJobs)
  registerDataHook('useStatefulSets', useUnifiedStatefulSets)
  registerDataHook('useDaemonSets', useUnifiedDaemonSets)
  registerDataHook('useHPAs', useUnifiedHPAs)
  registerDataHook('useReplicaSets', useUnifiedReplicaSets)
  registerDataHook('usePVs', useUnifiedPVs)
  registerDataHook('useResourceQuotas', useUnifiedResourceQuotas)
  registerDataHook('useLimitRanges', useUnifiedLimitRanges)
  registerDataHook('useNetworkPolicies', useUnifiedNetworkPolicies)
  registerDataHook('useNamespaces', useUnifiedNamespaces)
  registerDataHook('useOperatorSubscriptions', useUnifiedOperatorSubscriptions)
  registerDataHook('useServiceAccounts', useUnifiedServiceAccounts)
  registerDataHook('useK8sRoles', useUnifiedK8sRoles)
  registerDataHook('useK8sRoleBindings', useUnifiedK8sRoleBindings)
  registerDataHook('useServiceExports', useUnifiedServiceExports)
  registerDataHook('useServiceImports', useUnifiedServiceImports)

  // Filtered event hooks
  registerDataHook('useWarningEvents', useWarningEvents)
  registerDataHook('useRecentEvents', useRecentEvents)

  // Demo data hooks for cards without real data sources yet
  registerDataHook('useCachedClusterMetrics', useClusterMetrics)
  registerDataHook('useCachedResourceUsage', useResourceUsage)
  registerDataHook('useCachedEventsTimeline', useEventsTimeline)
  registerDataHook('useSecurityIssues', useSecurityIssues)
  registerDataHook('useActiveAlerts', useActiveAlerts)
  registerDataHook('useStorageOverview', useStorageOverview)
  registerDataHook('useNetworkOverview', useNetworkOverview)
  registerDataHook('useTopPods', useTopPods)
  registerDataHook('useGitOpsDrift', useGitOpsDrift)
  registerDataHook('usePodHealthTrend', usePodHealthTrend)
  registerDataHook('useResourceTrend', useResourceTrend)
  registerDataHook('useComputeOverview', useComputeOverview)

  // Batch 4 - ArgoCD, Prow, GPU, ML, Policy cards
  registerDataHook('useArgoCDApplications', useArgoCDApplications)
  registerDataHook('useGPUInventory', useGPUInventory)
  registerDataHook('useProwJobs', useProwJobs)
  registerDataHook('useMLJobs', useMLJobs)
  registerDataHook('useMLNotebooks', useMLNotebooks)
  registerDataHook('useOPAPolicies', useOPAPolicies)
  registerDataHook('useKyvernoPolicies', useKyvernoPolicies)
  registerDataHook('useAlertRules', useAlertRules)
  registerDataHook('useChartVersions', useChartVersions)
  registerDataHook('useCRDHealth', useCRDHealth)
  registerDataHook('useComplianceScore', useComplianceScore)
  registerDataHook('useNamespaceEvents', useNamespaceEvents)
  registerDataHook('useGPUWorkloads', useGPUWorkloads)
  registerDataHook('useDeploymentProgress', useDeploymentProgress)

  // Batch 5 - GitOps, Security, Status cards
  registerDataHook('useArgoCDHealth', useArgoCDHealth)
  registerDataHook('useArgoCDSyncStatus', useArgoCDSyncStatus)
  registerDataHook('useGatewayStatus', useGatewayStatus)
  registerDataHook('useKustomizationStatus', useKustomizationStatus)
  registerDataHook('useFluxStatus', useUnifiedFluxStatus)
  registerDataHook('useContourStatus', useUnifiedContourStatus)
  registerDataHook('useChaosMeshStatus', useUnifiedChaosMeshStatus)
  registerDataHook('useCachedBackstage', useUnifiedBackstageStatus)
  registerDataHook('useCachedContainerd', useUnifiedContainerdStatus)
  registerDataHook('useCachedCortex', useUnifiedCortexStatus)
  registerDataHook('useCachedDapr', useUnifiedDaprStatus)
  registerDataHook('useCachedDragonfly', useUnifiedDragonflyStatus)
  registerDataHook('useCachedEnvoy', useUnifiedEnvoyStatus)
  registerDataHook('useCachedGrpc', useUnifiedGrpcStatus)
  registerDataHook('useCachedKeda', useUnifiedKedaStatus)
  registerDataHook('useCachedKserve', useUnifiedKserveStatus)
  registerDataHook('useCachedLinkerd', useUnifiedLinkerdStatus)
  registerDataHook('useCachedLonghorn', useUnifiedLonghornStatus)
  registerDataHook('useCachedOtel', useUnifiedOtelStatus)
  registerDataHook('useCachedRook', useUnifiedRookStatus)
  registerDataHook('useCachedSpiffe', useUnifiedSpiffeStatus)
  registerDataHook('useCachedCni', useUnifiedCniStatus)
  registerDataHook('useCachedOpenfeature', useUnifiedOpenfeatureStatus)
  registerDataHook('useCachedSpire', useUnifiedSpireStatus)
  registerDataHook('useCachedKubevela', useUnifiedKubeVelaStatus)
  registerDataHook('useCachedStrimzi', useUnifiedStrimziStatus)
  registerDataHook('useCachedOpenfga', useUnifiedOpenfgaStatus)
  registerDataHook('useCachedFlatcar', useUnifiedFlatcarStatus)
  registerDataHook('useCachedTikv', useUnifiedTikvStatus)
  registerDataHook('useCachedTuf', useUnifiedTufStatus)
  registerDataHook('useCachedCloudCustodian', useUnifiedCloudCustodianStatus)
  registerDataHook('useCachedVitess', useUnifiedVitessStatus)
  registerDataHook('useCachedWasmcloud', useUnifiedWasmcloudStatus)
  registerDataHook('useCachedVolcano', useUnifiedVolcanoStatus)
  registerDataHook('useProviderHealth', useProviderHealth)
  registerDataHook('useUpgradeStatus', useUpgradeStatus)
  registerDataHook('useProwStatus', useProwStatus)
  registerDataHook('useProwHistory', useProwHistory)
  registerDataHook('useHelmHistory', useHelmHistory)
  registerDataHook('useExternalSecrets', useExternalSecrets)
  registerDataHook('useCertManager', useCertManager)
  registerDataHook('useVaultSecrets', useVaultSecrets)
  registerDataHook('useFalcoAlerts', useFalcoAlerts)
  registerDataHook('useKubescapeScan', useKubescapeScan)
  registerDataHook('useTrivyScan', useTrivyScan)
  registerDataHook('useEventSummary', useEventSummary)
  registerDataHook('useAppStatus', useAppStatus)
  registerDataHook('useGPUStatus', useGPUStatus)
  registerDataHook('useGPUUtilization', useGPUUtilization)
  registerDataHook('useGPUUsageTrend', useGPUUsageTrend)
  registerDataHook('usePolicyViolations', usePolicyViolations)
  registerDataHook('useNamespaceOverview', useNamespaceOverview)
  registerDataHook('useNamespaceQuotas', useNamespaceQuotas)
  registerDataHook('useNamespaceRBAC', useNamespaceRBAC)
  registerDataHook('useResourceCapacity', useResourceCapacity)

  // Batch 6 - Remaining compatible cards
  registerDataHook('useGithubActivity', useGithubActivity)
  registerDataHook('useRSSFeed', useRSSFeed)
  registerDataHook('useKubecostOverview', useKubecostOverview)
  registerDataHook('useOpencostOverview', useOpencostOverview)
  registerDataHook('useClusterCosts', useClusterCosts)
}

// Auto-register when this module is imported
registerUnifiedHooks()
