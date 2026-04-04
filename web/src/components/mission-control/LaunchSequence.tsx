/**
 * LaunchSequence — Deploy execution panel.
 *
 * Iterates deploy phases, loads KB mission JSON per project,
 * calls startMission() per cluster. Animated checklist with progress.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Rocket,
  Check,
  X,
  AlertTriangle,
  SkipForward,
  RotateCcw,
  PartyPopper,
  Loader2,
  Info,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { useMissions } from '../../hooks/useMissions'
import { loadMissionPrompt } from '../cards/multi-tenancy/missionLoader'
import type { MissionControlState, PhaseProgress, PhaseStatus } from './types'

interface LaunchSequenceProps {
  state: MissionControlState
  onUpdateProgress: (progress: PhaseProgress[]) => void
  onComplete: (dashboardId?: string) => void
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />,
  running: <Loader2 className="w-4 h-4 animate-spin text-amber-400" />,
  completed: <Check className="w-4 h-4 text-green-400" />,
  failed: <X className="w-4 h-4 text-red-400" />,
  skipped: <SkipForward className="w-4 h-4 text-muted-foreground" />,
}

export function LaunchSequence({
  state,
  onUpdateProgress,
  onComplete,
}: LaunchSequenceProps) {
  const { startMission, missions, isAIDisabled, agents, agentsLoading } = useMissions()
  const [isStarted, setIsStarted] = useState(false)
  const progressRef = useRef<PhaseProgress[]>(state.launchProgress)
  const startedMissions = useRef(new Set<string>())

  // Guard: if no phases or no assigned projects, render an informational empty state
  // instead of a false "Mission Complete!" (vacuous-truth on empty array).
  const hasNothingToDeploy =
    state.phases.length === 0 ||
    !state.phases.some((ph) => ph.projectNames.length > 0)

  // Show the "no agent" warning once loading has settled and no available agent is found.
  const noAgentAvailable = !agentsLoading && (isAIDisabled || !agents.some((a) => a.available))

  // Initialize progress from phases
  useEffect(() => {
    if (state.launchProgress.length > 0) {
      progressRef.current = state.launchProgress
      return
    }
    if (state.phases.length === 0) return

    const initial: PhaseProgress[] = state.phases.map((phase) => ({
      phase: phase.phase,
      status: 'pending' as PhaseStatus,
      projects: phase.projectNames.map((name) => ({
        name,
        status: 'pending' as const,
      })),
    }))
    progressRef.current = initial
    onUpdateProgress(initial)
  }, [state.phases.length])

  const updateProgress = useCallback(
    (updater: (prev: PhaseProgress[]) => PhaseProgress[]) => {
      const next = updater(progressRef.current)
      progressRef.current = next
      onUpdateProgress(next)
    },
    [onUpdateProgress]
  )

  // Launch a single project's mission
  const launchProject = useCallback(
    async (projectName: string, phaseNum: number) => {
      const project = state.projects.find((p) => p.name === projectName)
      if (!project) return

      const assignment = state.assignments.find((a) =>
        a.projectNames.includes(projectName)
      )
      const clusterName = assignment?.clusterName ?? 'default'

      // Update status to running
      updateProgress((prev) =>
        prev.map((p) =>
          p.phase === phaseNum
            ? {
                ...p,
                status: 'running',
                projects: p.projects.map((proj) =>
                  proj.name === projectName ? { ...proj, status: 'running' as const } : proj
                ),
              }
            : p
        )
      )

      try {
        // Load the KB mission prompt
        const fallbackPrompt = `Install ${project.displayName} on the Kubernetes cluster.`
        const prompt = await loadMissionPrompt(
          project.name,
          fallbackPrompt,
          project.kbPath ? [project.kbPath] : undefined,
        )

        const dryRunPrefix = state.isDryRun ? '[DRY RUN] ' : ''
        const clusterContext = `\n\n**Target cluster:** ${clusterName}`
        const missionId = startMission({
          title: `${dryRunPrefix}Install ${project.displayName}`,
          description: `${state.isDryRun ? 'Dry-run validation' : 'Automated install'} of ${project.displayName} as part of Mission Control deployment`,
          type: 'deploy',
          cluster: clusterName,
          initialPrompt: prompt + clusterContext,
          dryRun: state.isDryRun,
        })

        // Update with missionId
        updateProgress((prev) =>
          prev.map((p) =>
            p.phase === phaseNum
              ? {
                  ...p,
                  projects: p.projects.map((proj) =>
                    proj.name === projectName ? { ...proj, missionId } : proj
                  ),
                }
              : p
          )
        )
      } catch (err) {
        updateProgress((prev) =>
          prev.map((p) =>
            p.phase === phaseNum
              ? {
                  ...p,
                  projects: p.projects.map((proj) =>
                    proj.name === projectName
                      ? { ...proj, status: 'failed' as const, error: String(err) }
                      : proj
                  ),
                }
              : p
          )
        )
      }
    },
    [state.projects, state.assignments, startMission, updateProgress]
  )

  // Monitor mission statuses and update progress
  useEffect(() => {
    const progress = progressRef.current
    let changed = false
    const next = progress.map((phase) => ({
      ...phase,
      projects: phase.projects.map((proj) => {
        if (!proj.missionId) return proj
        const s = proj.status as string
        if (s === 'completed' || s === 'failed') return proj
        const mission = missions.find((m) => m.id === proj.missionId)
        if (!mission) return proj
        if (mission.status === 'completed') {
          changed = true
          return { ...proj, status: 'completed' as const }
        }
        if (mission.status === 'failed') {
          changed = true
          return { ...proj, status: 'failed' as const, error: 'Mission failed' }
        }
        return proj
      }),
    }))

    if (changed) {
      // Update phase-level status
      const updated = next.map((phase) => {
        const allDone = phase.projects.every(
          (p) => (['completed', 'failed', 'skipped'] as string[]).includes(p.status)
        )
        const anyFailed = phase.projects.some((p) => p.status === 'failed')
        return {
          ...phase,
          status: allDone
            ? anyFailed
              ? ('failed' as PhaseStatus)
              : ('completed' as PhaseStatus)
            : phase.status,
        }
      })
      progressRef.current = updated
      onUpdateProgress(updated)

      // Check if all phases complete
      if (updated.every((p) => p.status === 'completed' || p.status === 'failed' || p.status === 'skipped')) {
        onComplete()
      }
    }
  }, [missions, onUpdateProgress, onComplete])

  // Execute the launch sequence
  const startLaunch = useCallback(async () => {
    if (isStarted) return
    setIsStarted(true)

    const isYolo = state.deployMode === 'yolo'

    if (isYolo) {
      // Launch everything at once
      for (const phase of state.phases) {
        for (const projectName of phase.projectNames) {
          if (!startedMissions.current.has(projectName)) {
            startedMissions.current.add(projectName)
            launchProject(projectName, phase.phase)
          }
        }
      }
    } else {
      // Phased: launch phase 1, wait, then phase 2, etc.
      for (const phase of state.phases) {
        updateProgress((prev) =>
          prev.map((p) =>
            p.phase === phase.phase ? { ...p, status: 'running' } : p
          )
        )

        // Launch all projects in this phase
        for (const projectName of phase.projectNames) {
          if (!startedMissions.current.has(projectName)) {
            startedMissions.current.add(projectName)
            await launchProject(projectName, phase.phase)
          }
        }

        // For phased mode, we don't wait here — the useEffect monitors mission completions
        // and advances automatically
      }
    }
  }, [isStarted, state.phases, state.deployMode, launchProject, updateProgress])

  // Auto-start on mount
  useEffect(() => {
    if (!isStarted && state.phases.length > 0) {
      startLaunch()
    }
  }, [state.phases.length])

  const progress = state.launchProgress.length > 0 ? state.launchProgress : progressRef.current
  // Guard: only consider complete when there is actual work to track
  const allComplete = progress.length > 0 && progress.every(
    (p) => p.status === 'completed' || p.status === 'failed' || p.status === 'skipped'
  )
  const allSuccess = progress.length > 0 && progress.every((p) => p.status === 'completed')

  // --- Empty state: no deploy phases configured ---
  if (hasNothingToDeploy) {
    return (
      <div className="max-w-2xl mx-auto p-8 space-y-6 text-center">
        <div className="inline-flex p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold mb-2">No Deployment Plan Configured</h2>
          <p className="text-sm text-muted-foreground">
            The flight plan has no phases or assigned projects to deploy. Go back to the{' '}
            <strong>Chart Course</strong> step and either ask the AI to generate an assignment
            plan or manually assign projects to clusters.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-primary" />
            How deployment works
          </p>
          <p className="text-xs text-muted-foreground">
            Mission Control uses an AI agent to perform the actual installation of each
            project on its assigned cluster. When you click <strong>Deploy to Clusters</strong>,
            the agent runs <code className="text-xs bg-muted px-1 py-0.5 rounded">kubectl</code> and{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">helm</code> commands on
            your live clusters — following the phased plan shown in the flight plan.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => onComplete()}>
          Go Back
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* AI-powered deployment notice */}
      {!allComplete && (
        <div className={cn(
          'flex items-start gap-3 rounded-xl border p-3 text-xs',
          noAgentAvailable
            ? 'border-amber-500/30 bg-amber-500/5 text-amber-300'
            : 'border-primary/20 bg-primary/5 text-muted-foreground'
        )}>
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
          <span>
            {noAgentAvailable
              ? <>
                  <strong className="text-amber-400">No AI agent connected.</strong>{' '}
                  Install and start the KubeStellar Console agent (<code className="bg-muted px-1 py-0.5 rounded">kc-agent</code>) to enable live deployments.
                  Without a connected agent, missions cannot execute {state.isDryRun ? 'dry-run validations' : 'installations'} on your clusters.
                </>
              : <>
                  Each project is deployed via an AI agent that runs{' '}
                  <code className="bg-muted px-1 py-0.5 rounded">kubectl</code> and{' '}
                  <code className="bg-muted px-1 py-0.5 rounded">helm</code> commands on your live clusters.
                  {state.isDryRun
                    ? ' Dry-run mode validates resources without creating them.'
                    : ' Monitor progress in the Mission Sidebar on the right.'}
                </>
            }
          </span>
        </div>
      )}

      {/* Header */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 mb-3"
        >
          {allComplete ? (
            allSuccess ? (
              <PartyPopper className="w-8 h-8 text-green-400" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-amber-400" />
            )
          ) : (
            <Rocket className="w-8 h-8 text-violet-400" />
          )}
        </motion.div>
        <h2 className="text-2xl font-bold">
          {allComplete
            ? allSuccess
              ? state.isDryRun ? 'Dry Run Complete!' : 'Mission Complete!'
              : state.isDryRun ? 'Dry Run Completed with Issues' : 'Mission Completed with Issues'
            : state.isDryRun ? 'Dry Run In Progress' : 'Launch Sequence In Progress'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {allComplete
            ? 'All deployment phases have finished.'
            : `Deploying ${state.projects.length} project${state.projects.length !== 1 ? 's' : ''} across ${state.phases.length} phase${state.phases.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Phase checklist */}
      <div className="space-y-4">
        {progress.map((phase) => {
          const phaseDef = state.phases.find((p) => p.phase === phase.phase)
          return (
            <motion.div
              key={phase.phase}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (phase.phase - 1) * 0.15 }}
              className={cn(
                'rounded-xl border p-4',
                phase.status === 'running' && 'border-amber-500/30 bg-amber-500/5',
                phase.status === 'completed' && 'border-green-500/30 bg-green-500/5',
                phase.status === 'failed' && 'border-red-500/30 bg-red-500/5',
                phase.status === 'pending' && 'border-border bg-card',
                phase.status === 'skipped' && 'border-border bg-card opacity-50'
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                {STATUS_ICONS[phase.status]}
                <div className="flex-1">
                  <h3 className="text-sm font-medium">
                    Phase {phase.phase}: {phaseDef?.name ?? `Phase ${phase.phase}`}
                  </h3>
                </div>
                {phase.status === 'failed' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 text-xs"
                    icon={<RotateCcw className="w-3 h-3" />}
                    onClick={() => {
                      phase.projects.forEach((p) => {
                        if (p.status === 'failed') {
                          launchProject(p.name, phase.phase)
                        }
                      })
                    }}
                  >
                    Retry Failed
                  </Button>
                )}
              </div>

              <div className="space-y-1 ml-7">
                <AnimatePresence>
                  {phase.projects.map((proj) => (
                    <motion.div
                      key={proj.name}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="flex-shrink-0">{STATUS_ICONS[proj.status]}</span>
                      <span
                        className={cn(
                          'flex-1',
                          proj.status === 'completed' && 'text-green-400',
                          proj.status === 'failed' && 'text-red-400',
                          proj.status === 'running' && 'text-amber-400',
                          proj.status === 'pending' && 'text-muted-foreground'
                        )}
                      >
                        {state.projects.find((p) => p.name === proj.name)?.displayName ?? proj.name}
                      </span>
                      {proj.error && (
                        <span className="text-[10px] text-red-400 truncate max-w-[200px]" title={proj.error}>
                          {proj.error}
                        </span>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Completion actions */}
      {allComplete && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center gap-3 pt-4"
        >
          <Button variant="secondary" size="sm" onClick={() => onComplete()}>
            Close
          </Button>
        </motion.div>
      )}
    </div>
  )
}
