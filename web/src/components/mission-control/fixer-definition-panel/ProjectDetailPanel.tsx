import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchMissionContent } from '../../missions/browser/missionCache'
import type { MissionExport } from '../../../lib/missions/types'
import { cn } from '../../../lib/cn'
import type { PayloadProject } from '../types'

interface ProjectDetailPanelProps {
  project: PayloadProject
  allProjects: PayloadProject[]
  onReplace?: (oldName: string, newProject: PayloadProject) => void
}

interface AlternativeOption {
  name: string
  displayName: string
  reason: string
  isCurrent: boolean
  isOriginal: boolean
}

const INSTALL_STEP_TITLE_FALLBACK_LENGTH = 80

const ALTERNATIVES: Record<string, { name: string; displayName: string; reason: string }[]> = {
  falco: [
    { name: 'tetragon', displayName: 'Tetragon', reason: 'eBPF-based security observability by Cilium team' },
    { name: 'kubearmor', displayName: 'KubeArmor', reason: 'Runtime security enforcement using LSM' },
  ],
  'open-policy-agent': [
    { name: 'kyverno', displayName: 'Kyverno', reason: 'Kubernetes-native policy engine, no Rego needed' },
  ],
  kyverno: [
    { name: 'open-policy-agent', displayName: 'OPA Gatekeeper', reason: 'Rego-based policy engine, more flexible but steeper learning curve' },
  ],
  istio: [
    { name: 'linkerd', displayName: 'Linkerd', reason: 'Lighter service mesh with simpler operational model' },
    { name: 'cilium', displayName: 'Cilium Service Mesh', reason: 'eBPF-based mesh without sidecars' },
  ],
  linkerd: [
    { name: 'istio', displayName: 'Istio', reason: 'Feature-rich service mesh with Envoy proxy' },
  ],
  prometheus: [
    { name: 'thanos', displayName: 'Thanos', reason: 'Long-term Prometheus storage with global query' },
    { name: 'victoriametrics', displayName: 'VictoriaMetrics', reason: 'High-performance Prometheus-compatible TSDB' },
  ],
  cilium: [
    { name: 'calico', displayName: 'Calico', reason: 'Mature CNI with eBPF dataplane option' },
    { name: 'antrea', displayName: 'Antrea', reason: 'Kubernetes-native CNI using Open vSwitch' },
  ],
  'cert-manager': [
    { name: 'step-certificates', displayName: 'step-ca', reason: 'Smallstep CA for internal PKI' },
  ],
  'trivy-operator': [
    { name: 'grype', displayName: 'Grype', reason: 'Anchore vulnerability scanner' },
    { name: 'kubescape', displayName: 'Kubescape', reason: 'ARMO security posture scanning' },
  ],
  grype: [
    { name: 'trivy-operator', displayName: 'Trivy Operator', reason: 'Aqua vulnerability scanning for Kubernetes' },
    { name: 'kubescape', displayName: 'Kubescape', reason: 'ARMO security posture scanning' },
  ],
  kubescape: [
    { name: 'trivy-operator', displayName: 'Trivy Operator', reason: 'Aqua vulnerability scanning for Kubernetes' },
    { name: 'grype', displayName: 'Grype', reason: 'Anchore vulnerability scanner' },
  ],
  tetragon: [
    { name: 'falco', displayName: 'Falco', reason: 'Runtime threat detection via syscall monitoring' },
    { name: 'kubearmor', displayName: 'KubeArmor', reason: 'Runtime security enforcement using LSM' },
  ],
  kubearmor: [
    { name: 'falco', displayName: 'Falco', reason: 'Runtime threat detection via syscall monitoring' },
    { name: 'tetragon', displayName: 'Tetragon', reason: 'eBPF-based security observability by Cilium team' },
  ],
  calico: [
    { name: 'cilium', displayName: 'Cilium', reason: 'eBPF-based networking and security' },
    { name: 'antrea', displayName: 'Antrea', reason: 'Kubernetes-native CNI using Open vSwitch' },
  ],
}

const ALTERNATIVES_DISPLAY: Record<string, { displayName: string; reason: string }> = {
  falco: { displayName: 'Falco', reason: 'Runtime threat detection via syscall monitoring' },
  'open-policy-agent': { displayName: 'OPA Gatekeeper', reason: 'Rego-based policy engine for admission control' },
  kyverno: { displayName: 'Kyverno', reason: 'Kubernetes-native policy engine' },
  istio: { displayName: 'Istio', reason: 'Full-featured service mesh with Envoy proxy' },
  linkerd: { displayName: 'Linkerd', reason: 'Lightweight service mesh' },
  prometheus: { displayName: 'Prometheus', reason: 'CNCF monitoring and alerting toolkit' },
  cilium: { displayName: 'Cilium', reason: 'eBPF-based networking and security' },
  'cert-manager': { displayName: 'cert-manager', reason: 'Automated TLS certificate management' },
  'trivy-operator': { displayName: 'Trivy Operator', reason: 'Aqua vulnerability scanning for Kubernetes' },
}

function buildAvailableAlternatives(project: PayloadProject, allProjects: PayloadProject[]): AlternativeOption[] {
  const lookupKey = project.originalName ?? project.name
  const rawAlternatives = ALTERNATIVES[lookupKey] ?? []
  const isSwapped = Boolean(project.originalName)
  const allAlternatives: AlternativeOption[] = []

  if (isSwapped) {
    allAlternatives.push({
      name: lookupKey,
      displayName: ALTERNATIVES_DISPLAY[lookupKey]?.displayName ?? lookupKey,
      reason: ALTERNATIVES_DISPLAY[lookupKey]?.reason ?? 'Original AI recommendation',
      isCurrent: false,
      isOriginal: true,
    })
  }

  for (const alternative of rawAlternatives) {
    allAlternatives.push({
      ...alternative,
      isCurrent: alternative.name === project.name,
      isOriginal: false,
    })
  }

  if (!allAlternatives.some((alternative) => alternative.name === project.name)) {
    allAlternatives.unshift({
      name: project.name,
      displayName: project.displayName,
      reason: project.reason ?? '',
      isCurrent: true,
      isOriginal: false,
    })
  }

  return allAlternatives.filter(
    (alternative) => alternative.isCurrent || !allProjects.some((item) => item.name === alternative.name && item.name !== project.name),
  )
}

export function ProjectDetailPanel({ project, allProjects, onReplace }: ProjectDetailPanelProps) {
  const [mission, setMission] = useState<MissionExport | null>(null)
  const [loadingSteps, setLoadingSteps] = useState(false)
  const fetchedRef = useRef('')
  const availableAlternatives = buildAvailableAlternatives(project, allProjects)
  const isSwapped = Boolean(project.originalName)

  useEffect(() => {
    if (!project.kbPath || fetchedRef.current === project.kbPath) {
      return
    }

    fetchedRef.current = project.kbPath
    const controller = new AbortController()
    const indexMission: MissionExport = {
      version: 'kc-mission-v1',
      title: project.displayName,
      description: project.reason ?? '',
      type: 'custom',
      tags: [],
      steps: [],
      metadata: { source: project.kbPath },
    }

    setLoadingSteps(true)
    fetchMissionContent(indexMission)
      .then(({ mission: loadedMission }) => {
        if (!controller.signal.aborted) {
          setMission(loadedMission)
        }
      })
      .catch((error: unknown) => {
        if ((error as { name?: string } | undefined)?.name !== 'AbortError' && !controller.signal.aborted) {
          // Ignore fetch errors so the rest of the panel still renders.
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingSteps(false)
        }
      })

    return () => controller.abort()
  }, [project.kbPath, project.displayName, project.reason])

  return (
    <>
      <div>
        <h3 className="text-base font-bold text-foreground">{project.displayName}</h3>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {project.category}
          </span>
          {project.maturity && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
              {project.maturity}
            </span>
          )}
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            project.priority === 'required'
              ? 'bg-red-500/10 text-red-400'
              : project.priority === 'recommended'
                ? 'bg-blue-500/10 text-blue-400'
                : 'bg-gray-500/10 text-gray-400 dark:text-gray-500',
          )}>
            {project.priority}
          </span>
          {project.importedMission && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium">
              {project.replacesInstallMission ? 'your YAML' : 'your YAML + community'}
            </span>
          )}
        </div>
      </div>

      {project.reason && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Why AI Chose This</h4>
          <p className="text-sm text-foreground/80 leading-relaxed">{project.reason}</p>
        </div>
      )}

      {project.dependencies.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Dependencies</h4>
          <div className="flex flex-wrap gap-1">
            {project.dependencies.map((dependency) => (
              <span key={dependency} className="text-xs px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                {dependency}
              </span>
            ))}
          </div>
        </div>
      )}

      {project.kbPath && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Install Steps</h4>
          {loadingSteps ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading mission...
            </div>
          ) : mission?.steps && mission.steps.length > 0 ? (
            <div className="space-y-2">
              {mission.steps.map((step, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-[10px] font-bold text-primary mt-0.5 shrink-0">{index + 1}.</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {step.title || step.description?.slice(0, INSTALL_STEP_TITLE_FALLBACK_LENGTH)}
                    </p>
                    {step.command && (
                      <pre className="text-[10px] text-emerald-400 font-mono mt-0.5 bg-slate-800 rounded px-1.5 py-0.5 overflow-x-auto whitespace-pre-wrap break-all">
                        {step.command}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-400 font-mono">
              {project.kbPath.split('/').pop()?.replace('.json', '')}
            </p>
          )}
        </div>
      )}

      {availableAlternatives.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Alternatives {isSwapped && <span className="text-amber-400 normal-case font-normal ml-1">(swapped from original)</span>}
          </h4>
          <div className="space-y-2">
            {availableAlternatives.map((alternative) => (
              <div
                key={alternative.name}
                className={cn(
                  'rounded-lg border p-2.5 transition-colors',
                  alternative.isCurrent
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border hover:border-primary/30',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{alternative.displayName}</span>
                    {alternative.isCurrent && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                        Selected
                      </span>
                    )}
                    {alternative.isOriginal && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                        AI Original
                      </span>
                    )}
                  </div>
                  {!alternative.isCurrent && onReplace && (
                    <button
                      onClick={() => onReplace(project.name, {
                        name: alternative.name,
                        displayName: alternative.displayName,
                        reason: alternative.reason,
                        category: project.category,
                        priority: project.priority,
                        dependencies: project.dependencies,
                      })}
                      className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      Swap
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{alternative.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
