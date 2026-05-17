/**
 * Compliance cards backed by live data hooks.
 *
 * Each card detects whether the corresponding tool is installed in connected
 * clusters. When installed, it displays real per-cluster data. When not
 * installed, it falls back to demo data and offers an AI mission install link.
 */

import { useState, useMemo } from 'react'
import { AlertTriangle, AlertCircle, ShieldOff, Info, Loader2 } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useTrivy } from '../../hooks/useTrivy'
import { useMissions } from '../../hooks/useMissions'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { TrivyDetailModal } from './trivy/TrivyDetailModal'
import { TRIVY_SEVERITY } from '../../lib/constants/compliance'
import { CARD_UI_STRINGS } from './strings'

interface CardConfig {
  config?: Record<string, unknown>
}

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


export function TrivyScan({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { statuses, aggregated, isLoading, isRefreshing, installed, hasErrors, isDemoData, clustersChecked, totalClusters, unavailableReason, refetch } = useTrivy()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()
  const [modalCluster, setModalCluster] = useState<string | null>(null)

  /** Whether all clusters have been checked */
  const allChecked = clustersChecked >= totalClusters && totalClusters > 0

  // Filter by selected clusters
  const filtered = useMemo(() => {
    if (selectedClusters.length === 0) return aggregated
    const agg = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
    for (const [name, s] of Object.entries(statuses)) {
      if (!s.installed || !selectedClusters.includes(name)) continue
      const vuln = s.vulnerabilities
      if (!vuln) continue
      agg.critical += vuln.critical
      agg.high += vuln.high
      agg.medium += vuln.medium
      agg.low += vuln.low
      agg.unknown += vuln.unknown
    }
    return agg
  }, [selectedClusters, aggregated, statuses])

  const hasData = installed || isDemoData
  // #6219: surface failure state. `hasErrors` from useTrivy means at least
  // one cluster's scan errored — wire it through as isFailed so CardWrapper
  // can show the error path immediately instead of a stale-data fallthrough.
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData, isFailed: hasErrors })

  // Detect degraded state: installed but no reports generated (excludes clusters with errors)
  const isDegraded = (() => {
    if (!installed || isLoading) return false
    const installedClusters = Object.values(statuses).filter(s => s.installed && !s.error)
    return installedClusters.length > 0 && installedClusters.every(s => s.totalReports === 0)
  })()

  const handleInstall = () => {
    startMission({
      title: 'Install Trivy Operator',
      description: 'Install Trivy Operator for container vulnerability scanning',
      type: 'deploy',
      initialPrompt: `I want to install the Trivy Operator for vulnerability scanning on my clusters.

Please help me:
1. Install Trivy Operator via Helm (scan-only mode, no enforcement)
2. Verify the operator is running and scanning
3. Check for initial vulnerability reports

Use: helm install trivy-operator aquasecurity/trivy-operator --version 0.23.0 --namespace trivy --create-namespace

Please proceed step by step.`,
      context: {} })
  }

  const handleTroubleshoot = () => {
    const mission = TROUBLESHOOT_MISSIONS.trivy
    startMission({
      title: mission.title,
      description: mission.description,
      type: 'troubleshoot',
      initialPrompt: mission.prompt,
      context: {} })
  }

  // (#11747) In-cluster mode: show informative unavailable state
  if (unavailableReason) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
        <ShieldOff className="w-8 h-8 opacity-50" />
        <p>{CARD_UI_STRINGS.compliance.trivyUnavailable}</p>
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
            {t('cards:trivyScan.checkingClusters', { checked: clustersChecked, total: totalClusters })}
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
          <span>{t('cards:trivyScan.checkingClusters', { checked: clustersChecked, total: totalClusters })}</span>
        </div>
      )}

      {/* Fetch error state: one or more clusters failed to return scanner data */}
      {hasErrors && !isDemoData && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 font-medium">{t('cards:trivyScan.failedToFetch')}</p>
            <p className="text-muted-foreground">
              {t('cards:trivyScan.checkConnectivity')}{' '}
              <button onClick={() => refetch()} className="text-red-400 hover:underline">
                {t('cards:trivyScan.retry')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Install prompt when not detected and no errors (only after scanning completes) */}
      {!installed && !isLoading && !isRefreshing && !hasErrors && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-cyan-400 font-medium">{t('cards:trivyScan.integration')}</p>
            <p className="text-muted-foreground">
              {t('cards:trivyScan.installDescription')}{' '}
              <button onClick={handleInstall} className="text-cyan-400 hover:underline">
                {t('cards:trivyScan.installWithMission')} →
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
            <p className="text-amber-400 font-medium">{t('cards:trivyScan.noScanData')}</p>
            <p className="text-muted-foreground">
              {t('cards:trivyScan.installedNoReports')}{' '}
              <button onClick={handleTroubleshoot} className="text-amber-400 hover:underline">
                {t('cards:trivyScan.fixWithMission')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Per-cluster badges — click to open detail modal */}
      {installed && Object.values(statuses).some(s => s.installed) && (
        <div className="flex flex-wrap gap-1">
          {Object.values(statuses).filter(s => s.installed).map(s => (
            <button key={s.cluster} onClick={() => setModalCluster(s.cluster)} className="cursor-pointer">
              <StatusBadge color={(s.vulnerabilities?.critical ?? 0) > 0 ? 'red' : 'green'} size="xs">
                {s.cluster}: {s.vulnerabilities?.critical ?? 0}C/{s.vulnerabilities?.high ?? 0}H
              </StatusBadge>
            </button>
          ))}
        </div>
      )}

      <div
        className="grid grid-cols-2 gap-2 cursor-pointer"
        onClick={() => {
          // Open modal for first installed cluster matching filter
          const first = Object.values(statuses).find(s =>
            s.installed && (selectedClusters.length === 0 || selectedClusters.includes(s.cluster))
          )
          if (first) setModalCluster(first.cluster)
        }}
        role="button"
        aria-label={t('cards:trivyScan.viewDetailsAria')}
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
        <div className="p-2 rounded-lg bg-red-500/10 text-center hover:bg-red-500/20 transition-colors group/sev relative">
          <p className="text-xl font-bold text-red-400">{filtered.critical}</p>
          <p className="text-xs text-muted-foreground">{t('common.critical')}</p>
          <p className="text-[9px] text-red-400/70 mt-0.5 leading-tight">{TRIVY_SEVERITY.critical.description}</p>
        </div>
        <div className="p-2 rounded-lg bg-orange-500/10 text-center hover:bg-orange-500/20 transition-colors group/sev relative">
          <p className="text-xl font-bold text-orange-400">{filtered.high}</p>
          <p className="text-xs text-muted-foreground">{t('cards:trivyScan.high')}</p>
          <p className="text-[9px] text-orange-400/70 mt-0.5 leading-tight">{TRIVY_SEVERITY.high.description}</p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10 text-center hover:bg-yellow-500/20 transition-colors group/sev relative">
          <p className="text-xl font-bold text-yellow-400">{filtered.medium}</p>
          <p className="text-xs text-muted-foreground">{t('cards:trivyScan.medium')}</p>
          <p className="text-[9px] text-yellow-400/70 mt-0.5 leading-tight">{TRIVY_SEVERITY.medium.description}</p>
        </div>
        <div className="p-2 rounded-lg bg-blue-500/10 text-center hover:bg-blue-500/20 transition-colors group/sev relative">
          <p className="text-xl font-bold text-blue-400">{filtered.low}</p>
          <p className="text-xs text-muted-foreground">{t('cards:trivyScan.low')}</p>
          <p className="text-[9px] text-blue-400/70 mt-0.5 leading-tight">{TRIVY_SEVERITY.low.description}</p>
        </div>
      </div>

      {/* Action guidance */}
      {filtered.critical > 0 && (
        <div className="flex items-start gap-1.5 px-1 text-[10px] text-red-400/80">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{TRIVY_SEVERITY.critical.action}</span>
        </div>
      )}

      {/* Detail Modal */}
      {modalCluster && statuses[modalCluster] && (
        <TrivyDetailModal
          isOpen={!!modalCluster}
          onClose={() => setModalCluster(null)}
          clusterName={modalCluster}
          status={statuses[modalCluster]}
          onRefresh={() => refetch()}
          isRefreshing={isRefreshing}
        />
      )}
    </div>
  )
}

// ── Kubescape Security Posture ──────────────────────────────────────────

