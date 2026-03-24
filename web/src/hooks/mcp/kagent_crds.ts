import { useMemo, useCallback } from 'react'
import { isAgentUnavailable, reportAgentDataSuccess } from '../useLocalAgent'
import { clusterCacheRef, LOCAL_AGENT_URL } from './shared'
import { useCache } from '../../lib/cache'
import type {
  KagentCRDAgent,
  KagentCRDToolServer,
  KagentCRDModelConfig,
  KagentCRDMemory,
  KagentCRDSummary,
} from '../../types/kagent_crds'

// ─── Demo Data ─────────────────────────────────────────────────────

function getDemoAgents(): KagentCRDAgent[] {
  return [
    { name: 'k8s-agent', namespace: 'kagent', cluster: 'prod-east', agentType: 'Declarative', runtime: 'python', status: 'Ready', replicas: 1, readyReplicas: 1, modelConfigRef: 'claude-sonnet', toolCount: 3, a2aEnabled: true, systemMessage: 'You are a Kubernetes operations agent...', createdAt: '2025-02-01T10:00:00Z', age: '51d' },
    { name: 'istio-agent', namespace: 'kagent', cluster: 'prod-east', agentType: 'Declarative', runtime: 'python', status: 'Ready', replicas: 1, readyReplicas: 1, modelConfigRef: 'gpt-4o', toolCount: 2, a2aEnabled: true, systemMessage: 'You are an Istio service mesh expert...', createdAt: '2025-02-05T08:00:00Z', age: '47d' },
    { name: 'helm-agent', namespace: 'kagent', cluster: 'prod-west', agentType: 'Declarative', runtime: 'go', status: 'Ready', replicas: 2, readyReplicas: 2, modelConfigRef: 'claude-sonnet', toolCount: 2, a2aEnabled: false, systemMessage: 'You manage Helm chart deployments...', createdAt: '2025-02-10T12:00:00Z', age: '42d' },
    { name: 'argo-agent', namespace: 'kagent', cluster: 'prod-west', agentType: 'Declarative', runtime: 'python', status: 'Ready', replicas: 1, readyReplicas: 1, modelConfigRef: 'gemini-pro', toolCount: 2, a2aEnabled: true, systemMessage: 'You manage Argo Rollouts...', createdAt: '2025-02-12T14:00:00Z', age: '40d' },
    { name: 'observability-agent', namespace: 'kagent', cluster: 'staging', agentType: 'Declarative', runtime: 'python', status: 'Ready', replicas: 1, readyReplicas: 1, modelConfigRef: 'claude-sonnet', toolCount: 4, a2aEnabled: true, systemMessage: 'You are an observability expert...', createdAt: '2025-02-15T09:00:00Z', age: '37d' },
    { name: 'cilium-agent', namespace: 'kagent', cluster: 'staging', agentType: 'BYO', runtime: '', status: 'Ready', replicas: 1, readyReplicas: 1, modelConfigRef: '', toolCount: 1, a2aEnabled: false, systemMessage: '', createdAt: '2025-02-18T11:00:00Z', age: '34d' },
    { name: 'promql-agent', namespace: 'kagent', cluster: 'prod-east', agentType: 'Declarative', runtime: 'go', status: 'Pending', replicas: 1, readyReplicas: 0, modelConfigRef: 'gpt-4o', toolCount: 1, a2aEnabled: false, systemMessage: 'You translate natural language to PromQL...', createdAt: '2025-03-20T16:00:00Z', age: '4d' },
    { name: 'custom-byo-agent', namespace: 'default', cluster: 'prod-east', agentType: 'BYO', runtime: '', status: 'Ready', replicas: 1, readyReplicas: 1, modelConfigRef: '', toolCount: 0, a2aEnabled: true, systemMessage: '', createdAt: '2025-01-28T07:00:00Z', age: '55d' },
  ]
}

function getDemoTools(): KagentCRDToolServer[] {
  return [
    { name: 'kubernetes-tools', namespace: 'kagent', cluster: 'prod-east', kind: 'ToolServer', protocol: 'stdio', url: '', discoveredTools: [{ name: 'kubectl_get', description: 'Get Kubernetes resources' }, { name: 'kubectl_apply', description: 'Apply manifests' }, { name: 'kubectl_logs', description: 'View pod logs' }], status: 'Ready' },
    { name: 'istio-tools', namespace: 'kagent', cluster: 'prod-east', kind: 'ToolServer', protocol: 'stdio', url: '', discoveredTools: [{ name: 'istio_analyze', description: 'Analyze Istio configuration' }, { name: 'istio_proxy_status', description: 'Check proxy sync status' }], status: 'Ready' },
    { name: 'grafana-mcp', namespace: 'kagent', cluster: 'prod-west', kind: 'RemoteMCPServer', protocol: 'sse', url: 'http://grafana-mcp.monitoring:8080', discoveredTools: [{ name: 'search_dashboards', description: 'Search Grafana dashboards' }, { name: 'query_datasource', description: 'Query a Grafana datasource' }], status: 'Ready' },
    { name: 'helm-tools', namespace: 'kagent', cluster: 'prod-west', kind: 'ToolServer', protocol: 'stdio', url: '', discoveredTools: [{ name: 'helm_list', description: 'List Helm releases' }, { name: 'helm_upgrade', description: 'Upgrade a release' }], status: 'Ready' },
    { name: 'argo-tools', namespace: 'kagent', cluster: 'prod-west', kind: 'ToolServer', protocol: 'stdio', url: '', discoveredTools: [{ name: 'argo_get_rollout', description: 'Get rollout status' }, { name: 'argo_promote', description: 'Promote a rollout' }], status: 'Ready' },
    { name: 'querydoc-tools', namespace: 'kagent', cluster: 'staging', kind: 'RemoteMCPServer', protocol: 'streamableHTTP', url: 'http://querydoc.kagent:9090', discoveredTools: [{ name: 'search_docs', description: 'Search documentation' }], status: 'Ready' },
  ]
}

function getDemoModels(): KagentCRDModelConfig[] {
  return [
    { name: 'claude-sonnet', namespace: 'kagent', cluster: 'prod-east', kind: 'ModelConfig', provider: 'Anthropic', model: 'claude-sonnet-4-20250514', discoveredModels: [], modelCount: 0, lastDiscoveryTime: '', status: 'Ready' },
    { name: 'gpt-4o', namespace: 'kagent', cluster: 'prod-east', kind: 'ModelConfig', provider: 'OpenAI', model: 'gpt-4o', discoveredModels: [], modelCount: 0, lastDiscoveryTime: '', status: 'Ready' },
    { name: 'gemini-pro', namespace: 'kagent', cluster: 'prod-west', kind: 'ModelConfig', provider: 'Gemini', model: 'gemini-2.5-pro', discoveredModels: [], modelCount: 0, lastDiscoveryTime: '', status: 'Ready' },
    { name: 'ollama-local', namespace: 'kagent', cluster: 'staging', kind: 'ModelProviderConfig', provider: 'Ollama', model: '', discoveredModels: ['llama3', 'codellama', 'mistral'], modelCount: 3, lastDiscoveryTime: '2025-03-24T12:00:00Z', status: 'Ready' },
    { name: 'azure-openai', namespace: 'kagent', cluster: 'prod-west', kind: 'ModelConfig', provider: 'AzureOpenAI', model: 'gpt-4o-deployment', discoveredModels: [], modelCount: 0, lastDiscoveryTime: '', status: 'Ready' },
  ]
}

function getDemoMemories(): KagentCRDMemory[] {
  return [
    { name: 'k8s-agent-memory', namespace: 'kagent', cluster: 'prod-east', provider: 'pinecone', status: 'Ready' },
    { name: 'observability-memory', namespace: 'kagent', cluster: 'staging', provider: 'pinecone', status: 'Ready' },
  ]
}

// ─── Agent fetch helper ────────────────────────────────────────────

const AGENT_TIMEOUT = 15000

async function agentFetch<T>(path: string, cluster: string, namespace?: string): Promise<T | null> {
  if (isAgentUnavailable()) return null

  const params = new URLSearchParams()
  params.append('cluster', cluster)
  if (namespace) params.append('namespace', namespace)

  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), AGENT_TIMEOUT)
  try {
    const res = await fetch(`${LOCAL_AGENT_URL}${path}?${params}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(tid)
    if (!res.ok) throw new Error(`Agent ${res.status}`)
    return await res.json()
  } catch {
    clearTimeout(tid)
    return null
  }
}

/** Fetch from agent across all reachable clusters */
async function agentFetchAllClusters<T>(
  path: string,
  key: string,
  namespace?: string,
  specificCluster?: string,
): Promise<T[]> {
  if (isAgentUnavailable()) return []

  const clusters = clusterCacheRef.clusters.filter(c => c.reachable !== false && !c.name.includes('/'))
  if (clusters.length === 0) return []

  const targets = specificCluster
    ? clusters.filter(c => c.name === specificCluster)
    : clusters

  const results = await Promise.allSettled(
    targets.map(async ({ name, context }) => {
      const data = await agentFetch<Record<string, unknown>>(path, context || name, namespace)
      if (!data) throw new Error('No data')
      const items = (data[key] || []) as T[]
      return items.map(item => ({ ...item, cluster: name }))
    }),
  )

  const items: T[] = []
  for (const r of (results || [])) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items
}

// ─── Hooks ─────────────────────────────────────────────────────────

export function useKagentCRDAgents(options?: { cluster?: string; namespace?: string }) {
  return useCache<KagentCRDAgent[]>({
    key: `kagent-crd-agents:${options?.cluster || 'all'}:${options?.namespace || 'all'}`,
    category: 'clusters',
    initialData: [] as KagentCRDAgent[],
    demoData: getDemoAgents(),
    demoWhenEmpty: true,
    enabled: !isAgentUnavailable(),
    fetcher: async () => {
      const agents = await agentFetchAllClusters<KagentCRDAgent>(
        '/kagent-crds/agents', 'agents', options?.namespace, options?.cluster,
      )
      reportAgentDataSuccess()
      return agents
    },
  })
}

export function useKagentCRDTools(options?: { cluster?: string; namespace?: string }) {
  return useCache<KagentCRDToolServer[]>({
    key: `kagent-crd-tools:${options?.cluster || 'all'}:${options?.namespace || 'all'}`,
    category: 'clusters',
    initialData: [] as KagentCRDToolServer[],
    demoData: getDemoTools(),
    demoWhenEmpty: true,
    enabled: !isAgentUnavailable(),
    fetcher: async () => {
      const tools = await agentFetchAllClusters<KagentCRDToolServer>(
        '/kagent-crds/tools', 'tools', options?.namespace, options?.cluster,
      )
      reportAgentDataSuccess()
      return tools
    },
  })
}

export function useKagentCRDModels(options?: { cluster?: string; namespace?: string }) {
  return useCache<KagentCRDModelConfig[]>({
    key: `kagent-crd-models:${options?.cluster || 'all'}:${options?.namespace || 'all'}`,
    category: 'clusters',
    initialData: [] as KagentCRDModelConfig[],
    demoData: getDemoModels(),
    demoWhenEmpty: true,
    enabled: !isAgentUnavailable(),
    fetcher: async () => {
      const models = await agentFetchAllClusters<KagentCRDModelConfig>(
        '/kagent-crds/models', 'models', options?.namespace, options?.cluster,
      )
      reportAgentDataSuccess()
      return models
    },
  })
}

export function useKagentCRDMemories(options?: { cluster?: string; namespace?: string }) {
  return useCache<KagentCRDMemory[]>({
    key: `kagent-crd-memories:${options?.cluster || 'all'}:${options?.namespace || 'all'}`,
    category: 'clusters',
    initialData: [] as KagentCRDMemory[],
    demoData: getDemoMemories(),
    demoWhenEmpty: true,
    enabled: !isAgentUnavailable(),
    fetcher: async () => {
      const memories = await agentFetchAllClusters<KagentCRDMemory>(
        '/kagent-crds/memories', 'memories', options?.namespace, options?.cluster,
      )
      reportAgentDataSuccess()
      return memories
    },
  })
}

/** Aggregated summary computed from all kagent CRD sub-hooks */
export function useKagentCRDSummary() {
  const { data: agents, isLoading: agentsLoading, error: agentsError, refetch: refetchAgents } = useKagentCRDAgents()
  const { data: tools, isLoading: toolsLoading, refetch: refetchTools } = useKagentCRDTools()
  const { data: models, isLoading: modelsLoading, refetch: refetchModels } = useKagentCRDModels()
  const { data: memories, isLoading: memoriesLoading, refetch: refetchMemories } = useKagentCRDMemories()

  const isLoading = agentsLoading || toolsLoading || modelsLoading || memoriesLoading
  const error = agentsError

  const summary = useMemo((): KagentCRDSummary | null => {
    if (agents.length === 0 && tools.length === 0 && models.length === 0 && isLoading) {
      return null
    }

    const providers: Record<string, number> = {}
    for (const m of (models || [])) {
      providers[m.provider] = (providers[m.provider] || 0) + 1
    }

    const runtimes: Record<string, number> = {}
    const frameworks: Record<string, number> = {}
    for (const a of (agents || [])) {
      const rt = a.runtime || 'byo'
      runtimes[rt] = (runtimes[rt] || 0) + 1
      const fw = a.agentType
      frameworks[fw] = (frameworks[fw] || 0) + 1
    }

    const clusterMap = new Map<string, { agents: number; readyAgents: number; tools: number; models: number }>()
    for (const a of (agents || [])) {
      const entry = clusterMap.get(a.cluster) || { agents: 0, readyAgents: 0, tools: 0, models: 0 }
      entry.agents++
      if (a.status === 'Ready') entry.readyAgents++
      clusterMap.set(a.cluster, entry)
    }
    for (const t of (tools || [])) {
      const entry = clusterMap.get(t.cluster) || { agents: 0, readyAgents: 0, tools: 0, models: 0 }
      entry.tools++
      clusterMap.set(t.cluster, entry)
    }
    for (const m of (models || [])) {
      const entry = clusterMap.get(m.cluster) || { agents: 0, readyAgents: 0, tools: 0, models: 0 }
      entry.models++
      clusterMap.set(m.cluster, entry)
    }

    const totalDiscoveredTools = tools.reduce((sum, t) => sum + (t.discoveredTools?.length || 0), 0)

    return {
      agentCount: agents.length,
      readyAgents: agents.filter(a => a.status === 'Ready').length,
      failedAgents: agents.filter(a => a.status === 'Failed').length,
      toolServerCount: tools.length,
      totalDiscoveredTools,
      modelConfigCount: models.length,
      memoryCount: memories.length,
      providers,
      frameworks,
      runtimes,
      clusterBreakdown: Array.from(clusterMap.entries()).map(([cluster, data]) => ({
        cluster,
        agentCount: data.agents,
        readyAgents: data.readyAgents,
        toolCount: data.tools,
        modelCount: data.models,
        kagentInstalled: true,
      })),
    }
  }, [agents, tools, models, memories, isLoading])

  const refetch = useCallback(async () => {
    await Promise.all([refetchAgents(), refetchTools(), refetchModels(), refetchMemories()])
  }, [refetchAgents, refetchTools, refetchModels, refetchMemories])

  return { summary, isLoading, error, refetch }
}
