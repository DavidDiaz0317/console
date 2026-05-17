import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type {
  ClusterAssignment,
  DeployPhase,
  MissionControlState,
  PayloadProject,
} from './types'

export interface PersistedStateEntry {
  state: Partial<MissionControlState>
  savedAt: number
  schemaVersion?: number
}

export interface MissionConversationMessage {
  role: 'user' | 'assistant' | 'system' | string
  content: string
}

export interface BalancedBlockScanFrame {
  startIndex: number
  opener: '{' | '['
  expectedCloser: '}' | ']'
}

export interface BalancedBlockScanCursor {
  lastScanIndex: number
  inString: boolean
  escape: boolean
  frames: BalancedBlockScanFrame[]
  completedBlocks: string[]
}

export interface MissionControlMissionLike {
  id: string
  status: string
  messages?: MissionConversationMessage[]
}

export interface MissionControlClusterInfo {
  name: string
  context?: string
  server?: string
  distribution?: string
  cpuCores?: number
  memoryGB?: number
  storageGB?: number
  cpuUsageCores?: number
  cpuRequestsCores?: number
  memoryUsageGB?: number
  memoryRequestsGB?: number
}

export interface MissionControlHelmRelease {
  name: string
  chart?: string
  namespace?: string
  status?: string
  cluster?: string
}

export interface ParsedAssignmentsPayload {
  assignments: ClusterAssignment[]
  phases?: DeployPhase[]
}

export type MissionControlStateSetter = Dispatch<SetStateAction<MissionControlState>>
export type MissionControlRef<T> = MutableRefObject<T>
export type MissionControlProjects = PayloadProject[]
