/**
 * FixerDefinitionPanel — Phase 1 of Mission Control.
 *
 * Left: textarea + AI suggestions + PayloadGrid.
 * Right: Info panel showing hovered project details, mission steps, and alternatives.
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Info } from 'lucide-react'
import type { Mission } from '../../../hooks/useMissions'
import { getAssistantContentSinceLastUser } from '../useMissionControl'
import type { MissionControlState, PayloadProject } from '../types'
import { FixerDefinitionForm } from './FixerDefinitionForm'
import { MissionSummarySidebar } from './MissionSummarySidebar'
import { ProjectDetailPanel } from './ProjectDetailPanel'

const PLACEHOLDER_ROTATION_MS = 4000
const DETAIL_PANEL_TRANSITION_DURATION_S = 0.12

const PLACEHOLDER_EXAMPLES = [
  'Production-grade security compliance with runtime protection and policy enforcement...',
  'Full observability stack with metrics, tracing, and log aggregation across 3 clusters...',
  'Service mesh with mTLS, traffic management, and canary deployments...',
  'GitOps continuous delivery with automated rollbacks and multi-cluster sync...',
  'Edge computing platform with lightweight clusters and workload distribution...',
]

interface FixerDefinitionPanelProps {
  state: MissionControlState
  onDescriptionChange: (desc: string) => void
  onTitleChange: (title: string) => void
  onTargetClustersChange: (clusters: string[]) => void
  onAskAI: (description: string, existing?: PayloadProject[]) => void | Promise<void>
  onAddProject: (project: PayloadProject) => void
  onRemoveProject: (name: string) => void
  onUpdatePriority: (name: string, priority: PayloadProject['priority']) => void
  onReplaceProject?: (oldName: string, newProject: PayloadProject) => void
  aiStreaming: boolean
  planningMission: Mission | null | undefined
  installedProjects?: Set<string>
}

export function FixerDefinitionPanel({
  state,
  onDescriptionChange,
  onTitleChange,
  onTargetClustersChange,
  onAskAI,
  onAddProject,
  onRemoveProject,
  onUpdatePriority,
  onReplaceProject,
  aiStreaming,
  planningMission,
  installedProjects,
}: FixerDefinitionPanelProps) {
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [stickyProject, setStickyProject] = useState<PayloadProject | null>(null)
  const latestAIContent = getAssistantContentSinceLastUser(planningMission?.messages)
  const planningFailed = planningMission?.status === 'failed'
  const latestSystemError = planningFailed
    ? planningMission?.messages.filter((message) => message.role === 'system').slice(-1)[0]
    : undefined

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % PLACEHOLDER_EXAMPLES.length)
    }, PLACEHOLDER_ROTATION_MS)

    return () => window.clearInterval(interval)
  }, [])

  const handleSubmit = () => {
    if (!state.title && state.description.trim()) {
      const firstSentence = state.description.split(/[.!?\n]/)[0].trim()
      onTitleChange(firstSentence.slice(0, 60))
    }

    onAskAI(state.description, state.projects)
  }

  const resolvedStickyProject = stickyProject
    ? state.projects.find((project) => project.name === stickyProject.name) ?? stickyProject
    : null

  return (
    <div className="h-full flex">
      <MissionSummarySidebar projects={state.projects} />

      <FixerDefinitionForm
        state={state}
        placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]}
        onDescriptionChange={onDescriptionChange}
        onTitleChange={onTitleChange}
        onTargetClustersChange={onTargetClustersChange}
        onSubmit={handleSubmit}
        onAddProject={onAddProject}
        onRemoveProject={onRemoveProject}
        onUpdatePriority={onUpdatePriority}
        onCardClick={setStickyProject}
        aiStreaming={aiStreaming}
        planningMission={planningMission}
        planningFailed={planningFailed}
        latestSystemErrorContent={latestSystemError?.content ?? ''}
        latestAIContent={latestAIContent}
        installedProjects={installedProjects}
      />

      <div className="w-104 border-l border-border bg-card flex flex-col overflow-y-auto shrink-0">
        <AnimatePresence mode="wait">
          {resolvedStickyProject ? (
            <motion.div
              key={`p-${resolvedStickyProject.name}`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: DETAIL_PANEL_TRANSITION_DURATION_S }}
              className="p-4 space-y-4"
            >
              <ProjectDetailPanel
                project={resolvedStickyProject}
                allProjects={state.projects}
                onReplace={onReplaceProject
                  ? (oldName, newProject) => {
                    onReplaceProject(oldName, newProject)
                    setStickyProject(newProject)
                  }
                  : undefined}
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6"
            >
              <Info className="w-8 h-8 mb-3 opacity-30" />
              <p className="text-sm text-center">Click a project card for details</p>
              <p className="text-xs text-center mt-1 opacity-60">
                See AI reasoning, install steps, dependencies, and alternatives
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
