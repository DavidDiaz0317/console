/**
 * Compliance cards backed by live data hooks.
 *
 * Each card detects whether the corresponding tool is installed in connected
 * clusters. When installed, it displays real per-cluster data. When not
 * installed, it falls back to demo data and offers an AI mission install link.
 */

import { useState, useMemo } from 'react'
import { AlertTriangle, AlertCircle, Shield, ShieldOff, ExternalLink, Info, Loader2, ChevronRight, Sparkles } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useTrivy } from '../../hooks/useTrivy'
import { useKubescape } from '../../hooks/useKubescape'
import { useKyverno } from '../../hooks/useKyverno'
import { useMissions } from '../../hooks/useMissions'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { TrivyDetailModal } from './trivy/TrivyDetailModal'
import { KubescapeDetailModal } from './kubescape/KubescapeDetailModal'
import { KyvernoDetailModal } from './kyverno/KyvernoDetailModal'
import { getFrameworkInfo, getScoreContext, TRIVY_SEVERITY, CARD_DESCRIPTIONS } from '../../lib/constants/compliance'
import { ComplianceScoreBreakdownModal } from './compliance/ComplianceScoreBreakdownModal'
import { PolicyViolationDetailModal } from './compliance/PolicyViolationDetailModal'
import { loadMissionPrompt } from './multi-tenancy/missionLoader'
import { useApiKeyCheck, ApiKeyPromptModal } from './console-missions/shared'
import { ConfirmMissionPromptDialog } from '../missions/ConfirmMissionPromptDialog'
import { CARD_INSTALL_MAP } from '../../lib/cards/cardInstallMap'
import { CARD_UI_STRINGS } from './strings'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'
import { buildComplianceScoreSummary } from '../../lib/complianceScore'

interface CardConfig {
  config?: Record<string, unknown>
}

/** Maximum number of violation entries to display in PolicyViolations card */
const MAX_VIOLATION_ENTRIES = 10

/** Troubleshoot mission definitions for tools that are installed but not producing data */
const TROUBLESHOOT_MISSIONS: Record<string, { title: string; description: string; prompt: string }> = {
  trivy: {
    title: 'Troubleshoot Trivy Operator',
    description: 'Trivy is installed but not producing vulnerability reports',
    prompt: `Trivy Operator is installed on my cluster but no VulnerabilityReports are being generated.

Please help me diagnose and fix the issue:
1. Check the trivy-operator pod status: kubectl get pods -n trivy-system -n trivy
2. Check operator logs for errors: kubectl logs -n trivy-system -l app.kubernetes.io/name=trivy-operator --tail=50
3. Check if any VulnerabilityReports exist: kubectl get vulnerabilityreports -A
4. Check if the operator's scan jobs are running or failing: kubectl get jobs -n trivy-system -n trivy
5. If pods are crashing, check resource limits and node capacity
6. If scans are stuck, try restarting the operator: kubectl rollout restart deployment -n trivy-system trivy-operator

Please diagnose step by step and fix any issues found.` },
  kubescape: {
    title: 'Troubleshoot Kubescape Operator',
    description: 'Kubescape is installed but not producing scan results',
    prompt: `Kubescape Operator is installed on my cluster but no scan data is being generated (0 controls scanned).

Please help me diagnose and fix the issue:
1. Check all pods in the kubescape namespace: kubectl get pods -n kubescape
2. Look for crashing pods (especially kubevuln, operator, storage): kubectl get pods -n kubescape | grep -v Running
3. Check logs of failing pods: kubectl logs -n kubescape <pod-name> --tail=50
4. Verify the storage pod is running (required for scan data): kubectl get pods -n kubescape -l app=storage
5. Check if workloadconfigurationscans exist: kubectl get workloadconfigurationscans -A
6. If kubevuln or other pods are OOMKilled, increase resource limits
7. If storage pod is failing, check PVC status: kubectl get pvc -n kubescape
8. Try triggering a fresh scan: kubectl annotate ns default kubescape.io/scan=true --overwrite

Please diagnose step by step and fix any issues found.` },
  kyverno: {
    title: 'Troubleshoot Kyverno',
    description: 'Kyverno is installed but no policies are configured',
    prompt: `Kyverno is installed on my cluster but no policies are configured or producing reports.

Please help me diagnose and fix the issue:
1. Check Kyverno pod status: kubectl get pods -n kyverno
2. Check for any existing policies: kubectl get clusterpolicies,policies -A
3. Check Kyverno controller logs: kubectl logs -n kyverno -l app.kubernetes.io/component=admission-controller --tail=50
4. If no policies exist, install a basic audit policy set:
   - disallow-privileged-containers (audit mode)
   - require-labels (audit mode)
   - restrict-image-registries (audit mode)
5. Check PolicyReports are being generated: kubectl get policyreports -A
6. If pods are crashing, check resource limits and webhook configuration

Please diagnose step by step and fix any issues found.` } }

/** Install mission prompt for compliance tools (Kubescape + Kyverno) */
const COMPLIANCE_INSTALL_PROMPT = `I want to set up compliance monitoring on my Kubernetes clusters.

Please help me install one or both of these tools:

1. **Kubescape** — security posture scoring (CIS, NSA, MITRE frameworks)
   - Install via Helm: helm repo add kubescape https://kubescape.github.io/helm-charts && helm install kubescape kubescape/kubescape-operator -n kubescape --create-namespace

2. **Kyverno** — policy enforcement with compliance reports
   - Install via Helm: helm repo add kyverno https://kyverno.github.io/kyverno && helm install kyverno kyverno/kyverno -n kyverno --create-namespace

Please install at least one tool and verify it is producing scan results.`

/** Install mission fallback prompt for Falco (Issue 8846) — used when the
 *  structured mission JSON (fixes/cncf-install/install-falco.json) cannot
 *  be fetched from console-kb. */
const FALCO_INSTALL_PROMPT =
  'Install Falco for runtime security monitoring on this cluster. ' +
  'Falco provides container runtime threat detection by watching kernel ' +
  'system calls and Kubernetes audit events. ' +
  'Use the official Helm chart: ' +
  '`helm repo add falcosecurity https://falcosecurity.github.io/charts && ' +
  'helm install falco falcosecurity/falco --namespace falco --create-namespace`. ' +
  'After installation, verify the Falco pods are running and producing events.'

// ── Falco (static demo data — no live hook yet) ───────────────────────


export function KubescapeScan({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { statuses, aggregated, isLoading, isRefreshing, installed, hasErrors, isDemoData, clustersChecked, totalClusters, unavailableReason, refetch } = useKubescape()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()
  const [modalCluster, setModalCluster] = useState<string | null>(null)

  const installedClusters = useMemo(() =>
    Object.keys(statuses).filter(c => statuses[c].installed),
    [statuses]
  )

  /** Whether all clusters have been checked */
  const allChecked = clustersChecked >= totalClusters && totalClusters > 0

  // Filter by selected clusters
  const filtered = useMemo(() => {
    if (selectedClusters.length === 0) return aggregated
    const clusterStatuses = Object.entries(statuses)
      .filter(([name, s]) => s.installed && selectedClusters.includes(name))
      .map(([, s]) => s)
    if (clusterStatuses.length === 0) return aggregated
    const totalScore = clusterStatuses.reduce((sum, s) => sum + s.overallScore, 0)
    return {
      overallScore: Math.round(totalScore / clusterStatuses.length),
      frameworks: clusterStatuses[0]?.frameworks || [],
      totalControls: clusterStatuses.reduce((sum, s) => sum + s.totalControls, 0),
      passedControls: clusterStatuses.reduce((sum, s) => sum + s.passedControls, 0),
      failedControls: clusterStatuses.reduce((sum, s) => sum + s.failedControls, 0) }
  }, [statuses, aggregated, selectedClusters])

  const ksHasData = installed || isDemoData
  // #6219: surface failure state via the same `hasErrors` field useKubescape exposes.
  useCardLoadingState({ isLoading: isLoading && !ksHasData, isRefreshing, hasAnyData: ksHasData, isDemoData, isFailed: hasErrors })

  // Detect degraded state: installed but no scan data produced (excludes clusters with errors)
  const isDegraded = (() => {
    if (!installed || isLoading) return false
    const installedClusters = Object.values(statuses).filter(s => s.installed && !s.error)
    return installedClusters.length > 0 && installedClusters.every(s => s.totalControls === 0)
  })()

  const handleInstall = () => {
    startMission({
      title: 'Install Kubescape',
      description: 'Install Kubescape Operator for security posture management',
      type: 'deploy',
      initialPrompt: `I want to install the Kubescape Operator for security posture scanning on my clusters.

Please help me:
1. Install Kubescape Operator via Helm (scan-only, no enforcement)
2. Verify it's running and scanning
3. Check initial scan results

Use: helm install kubescape-operator kubescape/kubescape-operator --version 1.30.5 --namespace kubescape --create-namespace --set capabilities.continuousScan=enable

Please proceed step by step.`,
      context: {} })
  }

  const handleTroubleshoot = () => {
    const mission = TROUBLESHOOT_MISSIONS.kubescape
    startMission({
      title: mission.title,
      description: mission.description,
      type: 'troubleshoot',
      initialPrompt: mission.prompt,
      context: {} })
  }

  const score = filtered.overallScore

  // (#11747) In-cluster mode: show informative unavailable state
  if (unavailableReason) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
        <ShieldOff className="w-8 h-8 opacity-50" />
        <p>{CARD_UI_STRINGS.compliance.kubescapeUnavailable}</p>
        <p className="text-xs opacity-70">{CARD_UI_STRINGS.compliance.requiresLocalAgent}</p>
      </div>
    )
  }

  // Only show full-screen spinner on very first load with zero data
  if (isLoading && Object.keys(statuses).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        {totalClusters > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('cards:kubescapeScan.checkingClusters', { checked: clustersChecked, total: totalClusters })}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Progressive streaming indicator */}
      {!allChecked && totalClusters > 0 && !isRefreshing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('cards:kubescapeScan.checkingClusters', { checked: clustersChecked, total: totalClusters })}</span>
        </div>
      )}

      {/* Fetch error state: one or more clusters failed to return scanner data */}
      {hasErrors && !isDemoData && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 font-medium">{t('cards:kubescapeScan.failedToFetch')}</p>
            <p className="text-muted-foreground">
              {t('cards:kubescapeScan.checkConnectivity')}{' '}
              <button onClick={() => refetch()} className="text-red-400 hover:underline">
                {t('cards:kubescapeScan.retry')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Install prompt when not detected and no errors (only after scanning completes) */}
      {!installed && !isLoading && !isRefreshing && !hasErrors && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-green-400 font-medium">{t('cards:kubescapeScan.integration')}</p>
            <p className="text-muted-foreground">
              {t('cards:kubescapeScan.installDescription')}{' '}
              <button onClick={handleInstall} className="text-green-400 hover:underline">
                {t('cards:kubescapeScan.installWithMission')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Degraded state: installed but no scan data */}
      {isDegraded && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 font-medium">{t('cards:kubescapeScan.noScanData')}</p>
            <p className="text-muted-foreground">
              {t('cards:kubescapeScan.installedNoResults')}{' '}
              <button onClick={handleTroubleshoot} className="text-amber-400 hover:underline">
                {t('cards:kubescapeScan.fixWithMission')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Per-cluster scores — click to open detail modal */}
      {installed && Object.values(statuses).some(s => s.installed) && (
        <div className="flex flex-wrap gap-1">
          {Object.values(statuses).filter(s => s.installed).map(s => (
            <button key={s.cluster} onClick={() => setModalCluster(s.cluster)} className="cursor-pointer">
              <StatusBadge color={s.overallScore >= 80 ? 'green' : s.overallScore >= 60 ? 'yellow' : 'red'} size="xs">
                {s.cluster}: {s.overallScore}%
              </StatusBadge>
            </button>
          ))}
        </div>
      )}

      <div
        className="cursor-pointer"
        onClick={() => {
          const first = Object.values(statuses).find(s =>
            s.installed && (selectedClusters.length === 0 || selectedClusters.includes(s.cluster))
          )
          if (first) setModalCluster(first.cluster)
        }}
        role="button"
        aria-label={t('cards:kubescapeScan.viewDetailsAria')}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            const first = Object.values(statuses).find(s =>
              s.installed && (selectedClusters.length === 0 || selectedClusters.includes(s.cluster))
            )
            if (first) setModalCluster(first.cluster)
          }
        }}
      >
        {/* Score gauge with context */}
        <div className="flex items-center justify-center py-2">
          <div className="relative w-20 h-20">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-secondary" />
              <circle
                cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2"
                strokeDasharray={`${score}, 100`}
                className={score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-foreground">{score}%</span>
            </div>
          </div>
        </div>

        {/* Score context label */}
        {(() => {
          const ctx = getScoreContext(score)
          return (
            <div className="text-center mb-2">
              <span className={`text-xs font-semibold ${ctx.color}`}>{ctx.label}</span>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{ctx.description}</p>
            </div>
          )
        })()}

        {/* Controls summary */}
        <div className="flex items-center justify-center gap-3 mb-2 text-[10px] text-muted-foreground">
          <span>{filtered.passedControls} {t('cards:kubescapeScan.passed')}</span>
          <span className="text-muted-foreground/30">|</span>
          <span className={filtered.failedControls > 0 ? 'text-red-400' : ''}>{filtered.failedControls} {t('cards:kubescapeScan.failed')}</span>
          <span className="text-muted-foreground/30">|</span>
          <span>{filtered.totalControls} {t('cards:kubescapeScan.total')}</span>
        </div>

        {/* Framework list with descriptions */}
        <div className="space-y-1.5">
          {(filtered.frameworks || []).map((fw, i) => {
            const info = getFrameworkInfo(fw.name)
            return (
              <div key={i} className="rounded-md px-2 py-1.5 hover:bg-secondary/30 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-y-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-medium text-foreground truncate">
                      {info?.label || fw.name}
                    </span>
                    {info?.url && (
                      <a
                        href={sanitizeUrl(info.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground/50 hover:text-blue-400 transition-colors shrink-0"
                        title={t('cards:kubescapeScan.viewFrameworkSpec')}
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                  <span className={`text-xs font-bold ${fw.score >= 80 ? 'text-green-400' : fw.score >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {fw.score}%
                  </span>
                </div>
                {info && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{info.description}</p>
                )}
                {/* Score bar */}
                <div className="mt-1 h-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${fw.score >= 80 ? 'bg-green-400/60' : fw.score >= 60 ? 'bg-yellow-400/60' : 'bg-red-400/60'}`}
                    style={{ width: `${fw.score}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail Modal */}
      {modalCluster && statuses[modalCluster] && (
        <KubescapeDetailModal
          isOpen={!!modalCluster}
          onClose={() => setModalCluster(null)}
          clusterName={modalCluster}
          status={statuses[modalCluster]}
          clusters={installedClusters}
          onClusterChange={(newCluster) => setModalCluster(newCluster)}
          onRefresh={() => refetch()}
          isRefreshing={isRefreshing}
        />
      )}
    </div>
  )
}

// ── Policy Violations Aggregated ────────────────────────────────────────

