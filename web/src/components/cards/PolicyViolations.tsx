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

// ── Falco (static demo data — no live hook yet) ───────────────────────


export function PolicyViolations({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { statuses: kyvernoStatuses, isLoading: kyvernoLoading, isRefreshing: kyvernoRefreshing, isDemoData: kyvernoDemoData, installed: kyvernoInstalled, hasErrors: kyvernoHasErrors, clustersChecked: kyvernoChecked, totalClusters: kyvernoTotal, unavailableReason: kyvernoUnavailable, refetch: kyvernoRefetch } = useKyverno()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()
  const [modalCluster, setModalCluster] = useState<string | null>(null)
  const [selectedViolation, setSelectedViolation] = useState<{ policy: string; count: number; tool: string; clusters: string[] } | null>(null)

  /** Whether all clusters have been checked */
  const kyvernoAllChecked = kyvernoChecked >= kyvernoTotal && kyvernoTotal > 0

  // Aggregate violations from Kyverno reports. Per-policy violation counts are
  // back-populated from PolicyReport results in the hook, but we also use
  // reports for namespace-level breakdown since some policies may lack result data.
  const violations = useMemo(() => {
    const result: Array<{ policy: string; count: number; tool: string; clusters: string[] }> = []
    const clusterViolations = new Map<string, { count: number; clusters: string[] }>()

    for (const [clusterName, status] of Object.entries(kyvernoStatuses)) {
      if (!status.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue

      // Use reports for per-namespace breakdown when available
      if ((status.reports || []).length > 0) {
        for (const report of (status.reports || [])) {
          if (report.fail === 0) continue
          const key = report.namespace || 'cluster-scoped'
          if (!clusterViolations.has(key)) {
            clusterViolations.set(key, { count: 0, clusters: [] })
          }
          const entry = clusterViolations.get(key)!
          entry.count += report.fail
          if (!entry.clusters.includes(clusterName)) {
            entry.clusters.push(clusterName)
          }
        }
      } else if (status.totalViolations > 0) {
        // Fallback: aggregate totalViolations when reports array is empty
        const key = 'all-policies'
        if (!clusterViolations.has(key)) {
          clusterViolations.set(key, { count: 0, clusters: [] })
        }
        const entry = clusterViolations.get(key)!
        entry.count += status.totalViolations
        if (!entry.clusters.includes(clusterName)) {
          entry.clusters.push(clusterName)
        }
      }
    }

    for (const [key, data] of clusterViolations.entries()) {
      result.push({ policy: key, tool: 'Kyverno', ...data })
    }

    return result.sort((a, b) => b.count - a.count).slice(0, MAX_VIOLATION_ENTRIES)
  }, [kyvernoStatuses, selectedClusters])

  // Detect degraded state: installed but no policies configured
  const isDegraded = (() => {
    if (!kyvernoInstalled || kyvernoLoading) return false
    const installedClusters = Object.values(kyvernoStatuses).filter(s => s.installed)
    return installedClusters.length > 0 && installedClusters.every(s => s.totalPolicies === 0)
  })()

  const handleTroubleshoot = () => {
    const mission = TROUBLESHOOT_MISSIONS.kyverno
    startMission({
      title: mission.title,
      description: mission.description,
      type: 'troubleshoot',
      initialPrompt: mission.prompt,
      context: {} })
  }

  // Clusters contributing Kyverno data (must be before early returns to satisfy hooks rules)
  const participatingClusters = useMemo(() => Object.values(kyvernoStatuses).filter(s => s.installed).map(s => s.cluster), [kyvernoStatuses])

  const hasData = violations.length > 0 || kyvernoDemoData
  // #6219: surface kyverno fetch failures.
  useCardLoadingState({ isLoading: kyvernoLoading && !hasData, isRefreshing: kyvernoRefreshing, hasAnyData: hasData, isDemoData: kyvernoDemoData, isFailed: kyvernoHasErrors })

  // (#11747) In-cluster mode: show informative unavailable state
  if (kyvernoUnavailable) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
        <ShieldOff className="w-8 h-8 opacity-50" />
        <p>{CARD_UI_STRINGS.compliance.policyViolationsUnavailable}</p>
        <p className="text-xs opacity-70">{CARD_UI_STRINGS.compliance.requiresLocalAgent}</p>
      </div>
    )
  }

  if (violations.length === 0 && !kyvernoDemoData) {
    // Still scanning — show loading state instead of definitive empty state
    if (kyvernoLoading || kyvernoRefreshing) {
      return (
        <div className="space-y-3">
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
            <Loader2 className="w-8 h-8 mb-2 opacity-50 animate-spin" />
            <p className="text-sm">{t('cards:policyViolations.scanning')}</p>
            {kyvernoTotal > 0 ? (
              <p className="text-xs mt-1">{t('cards:policyViolations.checkingClusters', { checked: kyvernoChecked, total: kyvernoTotal })}</p>
            ) : (
              <p className="text-xs mt-1">{t('cards:policyViolations.checkingReports')}</p>
            )}
          </div>
        </div>
      )
    }
    // Fetch error state: one or more clusters failed to return scanner data
    if (kyvernoHasErrors) {
      return (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-400 font-medium">{t('cards:policyViolations.failedToFetch')}</p>
              <p className="text-muted-foreground">
                {t('cards:policyViolations.checkConnectivity')}{' '}
                <button onClick={() => kyvernoRefetch()} className="text-red-400 hover:underline">
                  {t('cards:policyViolations.retry')} →
                </button>
              </p>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-3">
        {/* Degraded state: installed but no policies */}
        {isDegraded && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 font-medium">{t('cards:policyViolations.noPoliciesConfigured')}</p>
              <p className="text-muted-foreground">
                {t('cards:policyViolations.kyvernoNoPolicies')}{' '}
                <button onClick={handleTroubleshoot} className="text-amber-400 hover:underline">
                  {t('cards:policyViolations.fixWithMission')} →
                </button>
              </p>
            </div>
          </div>
        )}
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
          <Shield className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">{t('cards:policyViolations.noViolationsDetected')}</p>
          <p className="text-xs mt-1">{t('cards:policyViolations.allResourcesComply')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Progressive streaming indicator */}
      {!kyvernoAllChecked && kyvernoTotal > 0 && !kyvernoRefreshing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('cards:policyViolations.checkingClusters', { checked: kyvernoChecked, total: kyvernoTotal })}</span>
        </div>
      )}

      {/* Participating clusters */}
      {participatingClusters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {participatingClusters.map(cluster => (
            <StatusBadge key={cluster} color="purple" size="xs">{cluster}</StatusBadge>
          ))}
        </div>
      )}

      {/* Context banner */}
      <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground bg-secondary/20 rounded-md px-2 py-1.5">
        <Info className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground/60" />
        <span>{CARD_DESCRIPTIONS.policy_violations.description}</span>
      </div>

      <div className="space-y-2">
        {(violations || []).map((v, i) => (
          <div
            key={i}
            className="group flex flex-wrap items-center justify-between gap-y-2 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
            onClick={() => setSelectedViolation(v)}
            role="button"
            aria-label={t('cards:policyViolations.viewViolationAria', { policy: v.policy })}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setSelectedViolation(v)
              }
            }}
          >
            <div>
              <p className="text-sm font-medium text-foreground">{v.policy}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{v.tool}</span>
                {v.clusters.length > 0 && (
                  <span>· {(v.clusters || []).join(', ')}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge color="orange" size="md">
                {v.count}
              </StatusBadge>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}
      </div>

      {/* Kyverno Detail Modal */}
      {modalCluster && kyvernoStatuses[modalCluster] && (
        <KyvernoDetailModal
          isOpen={!!modalCluster}
          onClose={() => setModalCluster(null)}
          clusterName={modalCluster}
          status={kyvernoStatuses[modalCluster]}
          onRefresh={() => kyvernoRefetch()}
          isRefreshing={kyvernoRefreshing}
        />
      )}

      {/* Policy Violation Detail Modal */}
      <PolicyViolationDetailModal
        isOpen={!!selectedViolation}
        onClose={() => setSelectedViolation(null)}
        violation={selectedViolation}
      />
    </div>
  )
}

// ── Compliance Score Gauge ──────────────────────────────────────────────

