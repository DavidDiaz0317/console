import { useCallback, useEffect, useRef } from 'react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { logger } from '@/lib/logger'
import {
  MAX_BALANCED_BLOCKS_INPUT,
  MAX_FENCE_BODY,
  STREAM_JSON_DEBOUNCE_MS,
} from './useMissionControl.constants'
import { isSafeProjectName, mergeProjects } from './useMissionControl.helpers'
import type {
  BalancedBlockScanCursor,
  MissionControlMissionLike,
  MissionControlRef,
  MissionControlStateSetter,
  ParsedAssignmentsPayload,
} from './useMissionControl.types'
import type {
  ClusterAssignment,
  DeployPhase,
  MissionControlState,
  PayloadProject,
} from './types'

export type { BalancedBlockScanCursor, BalancedBlockScanFrame } from './useMissionControl.types'

export function getAssistantMessagesSinceLastUser<T extends { role: string }>(messages: T[] | null | undefined): T[] {
  const safeMessages = Array.isArray(messages) ? messages : []
  const lastUserIndex = safeMessages.map((message) => message.role).lastIndexOf('user')
  return safeMessages.slice(lastUserIndex + 1).filter((message): message is T => message.role === 'assistant')
}

export function getAssistantContentSinceLastUser(messages: Array<{ role: string; content: string }> | null | undefined): string {
  return getAssistantMessagesSinceLastUser(messages).map((message) => message.content).join('')
}

const INITIAL_BALANCED_BLOCK_SCAN_INDEX = 0
const oversizedWarnSet = new Set<string>()

export function createBalancedBlockScanCursor(): BalancedBlockScanCursor {
  return {
    lastScanIndex: INITIAL_BALANCED_BLOCK_SCAN_INDEX,
    inString: false,
    escape: false,
    frames: [],
    completedBlocks: [],
  }
}

function resetBalancedBlockScanCursor(cursor: BalancedBlockScanCursor): void {
  cursor.lastScanIndex = INITIAL_BALANCED_BLOCK_SCAN_INDEX
  cursor.inString = false
  cursor.escape = false
  cursor.frames = []
  cursor.completedBlocks = []
}

export function resetOversizedWarnings(): void {
  oversizedWarnSet.clear()
}

function extractBalancedBlocks(text: string, warnKey?: string, cursor?: BalancedBlockScanCursor): string[] {
  const activeCursor = cursor ?? createBalancedBlockScanCursor()
  if (activeCursor.lastScanIndex > text.length) resetBalancedBlockScanCursor(activeCursor)

  if (text.length > MAX_BALANCED_BLOCKS_INPUT) {
    const key = warnKey ?? '__legacy__'
    if (!oversizedWarnSet.has(key)) {
      oversizedWarnSet.add(key)
      logger.warn(
        `[useMissionControl] extractBalancedBlocks: input too large (${text.length} chars > ${MAX_BALANCED_BLOCKS_INPUT}), skipping scan to avoid main-thread block (#6723). Further oversized inputs for key "${key}" will be suppressed until reset.`,
      )
    }
    return activeCursor.completedBlocks
  }

  for (let index = activeCursor.lastScanIndex; index < text.length; index += 1) {
    const char = text[index]
    if (activeCursor.escape) {
      activeCursor.escape = false
      continue
    }
    if (char === '\\' && activeCursor.inString) {
      activeCursor.escape = true
      continue
    }
    if (char === '"') {
      activeCursor.inString = !activeCursor.inString
      continue
    }
    if (activeCursor.inString) continue
    if (char === '{' || char === '[') {
      activeCursor.frames.push({
        startIndex: index,
        opener: char,
        expectedCloser: char === '{' ? '}' : ']',
      })
      continue
    }
    const topFrame = activeCursor.frames[activeCursor.frames.length - 1]
    if (!topFrame || char !== topFrame.expectedCloser) continue
    const completedFrame = activeCursor.frames.pop()
    if (!completedFrame || activeCursor.frames.length > 0) continue
    activeCursor.completedBlocks.push(text.substring(completedFrame.startIndex, index + 1))
  }

  activeCursor.lastScanIndex = text.length
  return activeCursor.completedBlocks
}

export function extractJSON<T>(
  text: string,
  requiredKey?: string,
  warnKey?: string,
  balancedBlockCursor?: BalancedBlockScanCursor,
): T | null {
  const fencedRe = new RegExp(String.raw`\`\`\`json\s*\n?([\s\S]{0,${MAX_FENCE_BODY}}?)\`\`\``, 'g')
  const candidates: T[] = []
  let match: RegExpExecArray | null

  while ((match = fencedRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].replace(/^\uFEFF/, '').trim()) as T
      if (requiredKey && typeof parsed === 'object' && parsed !== null && requiredKey in parsed) {
        return parsed
      }
      candidates.push(parsed)
    } catch {
      // skip unparseable blocks
    }
  }
  if (candidates.length > 0) return candidates[0]

  let best: T | null = null
  let bestLength = 0
  for (const block of extractBalancedBlocks(text, warnKey, balancedBlockCursor)) {
    try {
      const parsed = JSON.parse(block.replace(/^\uFEFF/, '').trim()) as T
      if (requiredKey && typeof parsed === 'object' && parsed !== null && requiredKey in parsed) {
        return parsed
      }
      if (block.length > bestLength) {
        best = parsed
        bestLength = block.length
      }
    } catch {
      // skip unparseable blocks
    }
  }
  return best
}

function normalizeProjects(
  assistantContent: string,
  planningMissionId: string | undefined,
  cursor: BalancedBlockScanCursor,
  kubaraChartNames: Set<string>,
): PayloadProject[] | null {
  const parsed = extractJSON<{ projects?: PayloadProject[] }>(assistantContent, 'projects', planningMissionId, cursor)
  const projectsRaw = parsed?.projects
  const projects = Array.isArray(projectsRaw) ? projectsRaw : []
  if (projectsRaw !== undefined && !Array.isArray(projectsRaw)) {
    logger.warn('[MissionControl] issue 6725 — AI returned non-array `projects` payload; ignoring.')
  }
  if (projects.length === 0) return null

  const validProjects = projects.filter((project) => {
    if (!isSafeProjectName(project?.name)) return false
    if (project.displayName !== undefined && !isSafeProjectName(project.displayName)) return false
    return true
  })
  if (validProjects.length === 0) {
    logger.warn('[MissionControl] AI returned projects payload with no valid entries; skipping update.')
    return null
  }
  if (validProjects.length !== projects.length) {
    logger.warn(`[MissionControl] filtered ${projects.length - validProjects.length} invalid project(s) from AI payload`)
  }

  return validProjects.map((project) => ({
    ...project,
    dependencies: project.dependencies ?? [],
    kubaraChartName: kubaraChartNames.has(project.name) ? project.name : undefined,
  }))
}

function normalizeAssignments(
  assistantContent: string,
  planningMissionId: string | undefined,
  cursor: BalancedBlockScanCursor,
): ParsedAssignmentsPayload | null {
  const parsed = extractJSON<{
    assignments?: ClusterAssignment[]
    phases?: DeployPhase[]
  }>(assistantContent, 'assignments', planningMissionId, cursor)
  const assignmentsRaw = parsed?.assignments
  const assignments = Array.isArray(assignmentsRaw) ? assignmentsRaw : []
  if (assignmentsRaw !== undefined && !Array.isArray(assignmentsRaw)) {
    logger.warn('[MissionControl] issue 6726 — AI returned non-array `assignments` payload; ignoring.')
  }
  return assignments.length > 0 ? { assignments, phases: parsed?.phases } : null
}

interface UseMissionControlPlanningParserParams {
  phase: MissionControlState['phase']
  planningMissionId: string | undefined
  planningMission: MissionControlMissionLike | undefined
  setState: MissionControlStateSetter
  kubaraChartNamesRef: MissionControlRef<Set<string>>
  aiTimedOutRef: MissionControlRef<boolean>
  userInteractedAfterTimeoutRef: MissionControlRef<boolean>
  userMutationGenerationRef: MissionControlRef<number>
  lastDispatchedGenerationRef: MissionControlRef<number>
}

export function useMissionControlPlanningParser({
  phase,
  planningMissionId,
  planningMission,
  setState,
  kubaraChartNamesRef,
  aiTimedOutRef,
  userInteractedAfterTimeoutRef,
  userMutationGenerationRef,
  lastDispatchedGenerationRef,
}: UseMissionControlPlanningParserParams) {
  const lastParsedContentRef = useRef('')
  const lastBalancedScanMissionIdRef = useRef<string | undefined>(planningMissionId)
  const lastAssistantMessageCountRef = useRef(0)
  const balancedBlockScanCursorRef = useRef<BalancedBlockScanCursor>(createBalancedBlockScanCursor())
  const latestAssistantContent = getAssistantContentSinceLastUser(planningMission?.messages)
  const debouncedAssistantContent = useDebouncedValue(latestAssistantContent, STREAM_JSON_DEBOUNCE_MS)

  useEffect(() => {
    if (!planningMission || !planningMissionId || planningMission.id !== planningMissionId) return
    if (aiTimedOutRef.current || userInteractedAfterTimeoutRef.current || !debouncedAssistantContent) return

    const assistantMessages = getAssistantMessagesSinceLastUser(planningMission.messages)
    if (planningMission.id !== lastBalancedScanMissionIdRef.current) {
      lastBalancedScanMissionIdRef.current = planningMission.id
      lastAssistantMessageCountRef.current = assistantMessages.length
      resetBalancedBlockScanCursor(balancedBlockScanCursorRef.current)
    } else if (assistantMessages.length !== lastAssistantMessageCountRef.current) {
      lastAssistantMessageCountRef.current = assistantMessages.length
      resetBalancedBlockScanCursor(balancedBlockScanCursorRef.current)
    }

    const assistantContent = assistantMessages.map((message) => message.content).join('')
    if (!assistantContent || assistantContent === lastParsedContentRef.current) return

    if (phase === 'define') {
      const parsedProjects = normalizeProjects(
        assistantContent,
        planningMissionId,
        balancedBlockScanCursorRef.current,
        kubaraChartNamesRef.current,
      )
      if (!parsedProjects) return
      lastParsedContentRef.current = assistantContent
      setState((prev) => ({ ...prev, projects: mergeProjects(prev.projects, parsedProjects) }))
      return
    }

    if (phase === 'assign') {
      const parsedAssignments = normalizeAssignments(
        assistantContent,
        planningMissionId,
        balancedBlockScanCursorRef.current,
      )
      if (!parsedAssignments) return
      if (lastDispatchedGenerationRef.current !== userMutationGenerationRef.current) {
        logger.warn('[MissionControl] issue 6404 — discarding stale AI assignment stream (user mutated state after dispatch)')
        lastParsedContentRef.current = assistantContent
        return
      }
      lastParsedContentRef.current = assistantContent
      setState((prev) => {
        const aiClusterNames = new Set(parsedAssignments.assignments.map((assignment) => assignment.clusterName))
        const preservedAssignments = prev.assignments.filter(
          (assignment) => !aiClusterNames.has(assignment.clusterName),
        )
        return {
          ...prev,
          assignments: [...parsedAssignments.assignments, ...preservedAssignments],
          phases: parsedAssignments.phases ?? prev.phases,
        }
      })
    }
  }, [
    aiTimedOutRef,
    debouncedAssistantContent,
    kubaraChartNamesRef,
    lastDispatchedGenerationRef,
    phase,
    planningMission,
    planningMission?.messages?.length,
    planningMission?.status,
    planningMissionId,
    setState,
    userInteractedAfterTimeoutRef,
    userMutationGenerationRef,
  ])

  const resetPlanningParser = useCallback(() => {
    lastParsedContentRef.current = ''
    lastBalancedScanMissionIdRef.current = undefined
    lastAssistantMessageCountRef.current = 0
    resetBalancedBlockScanCursor(balancedBlockScanCursorRef.current)
  }, [])

  return { resetPlanningParser }
}
