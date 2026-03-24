import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchKagentStatus, fetchKagentAgents, type KagentAgent, type KagentStatus } from '../lib/kagentBackend'

const KAGENT_POLL_INTERVAL_MS = 30_000
const KAGENT_SELECTED_AGENT_KEY = 'kc_kagent_selected_agent'
const KAGENT_BACKEND_PREF_KEY = 'kc_agent_backend_preference'

export type AgentBackendType = 'kc-agent' | 'kagent'

export interface UseKagentBackendResult {
  /** Whether kagent is available in the cluster */
  kagentAvailable: boolean
  /** Kagent status details */
  kagentStatus: KagentStatus | null
  /** List of available kagent agents */
  kagentAgents: KagentAgent[]
  /** Currently selected kagent agent */
  selectedKagentAgent: KagentAgent | null
  /** Select a kagent agent */
  selectKagentAgent: (agent: KagentAgent) => void
  /** User's preferred backend */
  preferredBackend: AgentBackendType
  /** Set preferred backend */
  setPreferredBackend: (backend: AgentBackendType) => void
  /** The active backend (based on preference + availability) */
  activeBackend: AgentBackendType
  /** Refresh kagent status and agents */
  refresh: () => void
}

export function useKagentBackend(): UseKagentBackendResult {
  const [kagentStatus, setKagentStatus] = useState<KagentStatus | null>(null)
  const [kagentAgents, setKagentAgents] = useState<KagentAgent[]>([])
  const [selectedKagentAgent, setSelectedKagentAgent] = useState<KagentAgent | null>(null)
  const [preferredBackend, setPreferredBackendState] = useState<AgentBackendType>(() => {
    const saved = localStorage.getItem(KAGENT_BACKEND_PREF_KEY)
    return (saved === 'kagent' ? 'kagent' : 'kc-agent') as AgentBackendType
  })
  const pollRef = useRef<ReturnType<typeof setInterval>>()
  const selectedRef = useRef(selectedKagentAgent)
  selectedRef.current = selectedKagentAgent

  const refresh = useCallback(async () => {
    const status = await fetchKagentStatus()
    setKagentStatus(status)
    if (status.available) {
      const agents = await fetchKagentAgents()
      setKagentAgents(agents)
      // Restore selected agent from localStorage
      const savedName = localStorage.getItem(KAGENT_SELECTED_AGENT_KEY)
      if (savedName && !selectedRef.current) {
        const found = agents.find(a => `${a.namespace}/${a.name}` === savedName)
        if (found) setSelectedKagentAgent(found)
      }
    } else {
      setKagentAgents([])
    }
  }, [])

  useEffect(() => {
    refresh()
    pollRef.current = setInterval(refresh, KAGENT_POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [refresh])

  const selectKagentAgent = useCallback((agent: KagentAgent) => {
    setSelectedKagentAgent(agent)
    localStorage.setItem(KAGENT_SELECTED_AGENT_KEY, `${agent.namespace}/${agent.name}`)
  }, [])

  const setPreferredBackend = useCallback((backend: AgentBackendType) => {
    setPreferredBackendState(backend)
    localStorage.setItem(KAGENT_BACKEND_PREF_KEY, backend)
  }, [])

  const kagentAvailable = kagentStatus?.available ?? false
  const activeBackend: AgentBackendType = preferredBackend === 'kagent' && kagentAvailable ? 'kagent' : 'kc-agent'

  return {
    kagentAvailable,
    kagentStatus,
    kagentAgents,
    selectedKagentAgent,
    selectKagentAgent,
    preferredBackend,
    setPreferredBackend,
    activeBackend,
    refresh,
  }
}
