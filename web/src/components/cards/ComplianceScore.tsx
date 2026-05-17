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


export function ComplianceScore({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { statuses: kubescapeStatuses, aggregated: kubescapeAgg, isLoading: ksLoading, isRefreshing: ksRefreshing, isDemoData: ksDemoData, installed: ksInstalled, hasErrors: ksHasErrors, clustersChecked: ksChecked, totalClusters: ksTotal, unavailableReason: ksUnavailable } = useKubescape()
  const { statuses: kyvernoStatuses, isLoading: kyLoading, isRefreshing: kyRefreshing, isDemoData: kyDemoData, installed: kyInstalled, hasErrors: kyHasErrors, clustersChecked: kyChecked, totalClusters: kyTotal, unavailableReason: kyUnavailable } = useKyverno()
  const { selectedClusters } = useGlobalFilters()
  const { startMission } = useMissions()
  const [showBreakdown, setShowBreakdown] = useState(false)

  const isLoading = ksLoading || kyLoading

  /** Combined progress: use the slower of the two tools' cluster checks */
  const totalChecking = Math.max(ksTotal, kyTotal)
  const minChecked = Math.min(ksChecked, kyChecked)
  const allChecked = minChecked >= totalChecking && totalChecking > 0

  const { score, breakdown, usingFallback } = useMemo(() => buildComplianceScoreSummary({
    kubescapeStatuses,
    kyvernoStatuses,
    selectedClusters,
  }), [kubescapeStatuses, kyvernoStatuses, selectedClusters])

  // Kyverno aggregation for breakdown modal
  const kyvernoBreakdownData = useMemo(() => {
    let totalPolicies = 0
    let totalViolations = 0
    let enforcingCount = 0
    let auditCount = 0
    for (const [clusterName, status] of Object.entries(kyvernoStatuses)) {
      if (!status.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue
      totalPolicies += status.totalPolicies
      totalViolations += status.totalViolations
      enforcingCount += status.enforcingCount
      auditCount += status.auditCount
    }
    return totalPolicies > 0 ? { totalPolicies, totalViolations, enforcingCount, auditCount } : undefined
  }, [kyvernoStatuses, selectedClusters])

  // Mark as demo data only when hooks report demo mode (explicit demo or forced Netlify).
  // When compliance tools are not installed, show an install prompt instead of a fake demo score.
  const isDemoData = ksDemoData || kyDemoData

  const handleInstallCompliance = () => {
    startMission({
      title: 'Install Compliance Tools',
      description: 'Install Kubescape and/or Kyverno for compliance score tracking',
      type: 'deploy',
      initialPrompt: COMPLIANCE_INSTALL_PROMPT,
      context: {} })
  }

  const scoreHasData = !usingFallback || isDemoData
  // #6219: card is failed when both Kubescape and Kyverno had errors
  // (single-tool failure still produces a meaningful partial score).
  const scoreFailed = ksHasErrors && kyHasErrors
  useCardLoadingState({ isLoading: isLoading && !scoreHasData, isRefreshing: ksRefreshing || kyRefreshing, hasAnyData: scoreHasData, isDemoData, isFailed: scoreFailed })

  // (#11747) In-cluster mode: show informative unavailable state
  if (ksUnavailable && kyUnavailable) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
        <ShieldOff className="w-8 h-8 opacity-50" />
        <p>{CARD_UI_STRINGS.compliance.complianceScoreUnavailable}</p>
        <p className="text-xs opacity-70">{CARD_UI_STRINGS.compliance.requiresLocalAgent}</p>
      </div>
    )
  }

  const scoreCtx = getScoreContext(score)

  // Clusters contributing to the composite score
  const scoreClusters = useMemo(() => {
    const clusters = new Set<string>()
    for (const s of Object.values(kubescapeStatuses)) {
      if (s.installed) clusters.add(s.cluster)
    }
    for (const s of Object.values(kyvernoStatuses)) {
      if (s.installed) clusters.add(s.cluster)
    }
    return Array.from(clusters)
  }, [kubescapeStatuses, kyvernoStatuses])

  // Whether no compliance tools are installed (and we've finished loading)
  const noToolsInstalled = !isLoading && !ksInstalled && !kyInstalled && !isDemoData

  return (
    <div className="space-y-3">
      {/* Progressive streaming indicator */}
      {!allChecked && totalChecking > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('cards:complianceScore.checkingClusters', { checked: minChecked, total: totalChecking })}</span>
        </div>
      )}

      {/* Participating clusters */}
      {scoreClusters.length > 0 && !isDemoData && (
        <div className="flex flex-wrap gap-1">
          {scoreClusters.map(cluster => (
            <StatusBadge key={cluster} color="purple" size="xs">{cluster}</StatusBadge>
          ))}
        </div>
      )}

      {/* Context description */}
      <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground bg-secondary/20 rounded-md px-2 py-1.5">
        <Info className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground/60" />
        <span>{CARD_DESCRIPTIONS.compliance_score.description}</span>
      </div>

      {/* Partial coverage warning — not all clusters are reporting */}
      {!isDemoData && !usingFallback && allChecked && totalChecking > 0 && scoreClusters.length < totalChecking && (
        <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-md px-2 py-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>
            {t('cards:complianceScore.partialCoverage', { reporting: scoreClusters.length, total: totalChecking })}
          </span>
        </div>
      )}

      {/* No compliance tools installed — show install prompt instead of fake demo score */}
      {noToolsInstalled && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-cyan-400 font-medium">{t('cards:complianceScore.noToolsDetected')}</p>
            <p className="text-muted-foreground">
              {t('cards:complianceScore.installDescription')}{' '}
              <button onClick={handleInstallCompliance} className="text-cyan-400 hover:underline">
                {t('cards:complianceScore.installWithMission')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Score chart — only shown when real data exists or in demo mode */}
      {!noToolsInstalled && (
        <>
          <div
            className="flex items-center justify-center py-4 cursor-pointer group"
            onClick={() => setShowBreakdown(true)}
            role="button"
            aria-label={t('cards:complianceScore.viewBreakdownAria')}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setShowBreakdown(true)
              }
            }}
            title={t('cards:complianceScore.clickForBreakdown')}
          >
            <div className="relative w-24 h-24 group-hover:scale-105 transition-transform">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary" />
                <circle
                  cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3"
                  strokeDasharray={`${score}, 100`}
                  className={score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">{score}%</span>
              </div>
            </div>
          </div>

          {/* Score context */}
          <div className="text-center">
            <span className={`text-xs font-semibold ${scoreCtx.color}`}>{scoreCtx.label}</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">{scoreCtx.description}</p>
          </div>

          {/* Breakdown by tool */}
          <div className="space-y-1.5">
            {(breakdown || []).map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-1">
                <span className="text-xs text-muted-foreground w-20 truncate">{item.name}</span>
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${item.value >= 80 ? 'bg-green-400/60' : item.value >= 60 ? 'bg-yellow-400/60' : 'bg-red-400/60'}`}
                    style={{ width: `${item.value}%` }}
                  />
                </div>
                <span className={`text-xs font-medium w-10 text-right ${item.value >= 80 ? 'text-green-400' : item.value >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {item.value}%
                </span>
              </div>
            ))}
          </div>

          {/* Breakdown Modal */}
          <ComplianceScoreBreakdownModal
            isOpen={showBreakdown}
            onClose={() => setShowBreakdown(false)}
            score={score}
            breakdown={breakdown}
            kubescapeData={kubescapeAgg.totalControls > 0 ? {
              totalControls: kubescapeAgg.totalControls,
              passedControls: kubescapeAgg.passedControls,
              failedControls: kubescapeAgg.failedControls,
              frameworks: kubescapeAgg.frameworks || [] } : undefined}
            kyvernoData={kyvernoBreakdownData}
          />
        </>
      )}
    </div>
  )
}
