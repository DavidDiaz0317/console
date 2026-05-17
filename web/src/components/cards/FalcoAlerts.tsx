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


export function FalcoAlerts({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { isDemoMode } = useDemoMode()
  const { startMission } = useMissions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()
  // Issue 8846 — Holds the AI mission prompt pending user review/edit before running.
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)

  // Falco has no live data hook yet so isDemoData is always true.
  // However, we still gate the demo content on isDemoMode so the card
  // correctly shows an empty / install-prompt state when a real agent
  // is connected but Falco is not installed.
  const showDemo = isDemoMode
  useCardLoadingState({ isLoading: false, hasAnyData: showDemo, isDemoData: showDemo })

  const demoAlerts = [
    { severity: 'critical', message: 'Container escape attempt detected', time: '2m ago' },
    { severity: 'warning', message: 'Privileged pod spawned', time: '15m ago' },
    { severity: 'info', message: 'Shell spawned in container', time: '1h ago' },
  ]

  // Issue 8846 — Launch the Falco install AI mission. Resolves the structured
  // install-falco.json mission from console-kb; falls back to a raw prompt
  // if the fetch fails.
  const handleInstallFalco = () => {
    checkKeyAndRun(async () => {
      const installInfo = CARD_INSTALL_MAP.falco_alerts
      const prompt = await loadMissionPrompt(
        installInfo?.missionKey ?? 'install-falco',
        FALCO_INSTALL_PROMPT,
        installInfo?.kbPaths,
      )
      setPendingPrompt(prompt)
    })
  }

  if (!showDemo) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-purple-400 font-medium">{t('cards:falcoAlerts.integration')}</p>
            <p className="text-muted-foreground">
              {t('cards:falcoAlerts.installDescription')}{' '}
              <a
                href="https://falco.org/docs/install-operate/installation/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline"
              >
                {t('cards:falcoAlerts.installGuide')} &rarr;
              </a>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-4 text-muted-foreground text-sm">
          <Shield className="w-6 h-6 mb-2 text-purple-400" />
          <p>{t('cards:falcoAlerts.noAlertsAvailable')}</p>
          <p className="text-xs mt-1">{t('cards:falcoAlerts.installToSee')}</p>
          {/* Issue 8846 — AI-mission install CTA parity with other detector cards
              (Trivy/Kubescape/OVN etc.) so users can launch a guided install
              directly from the Falco Alerts card. */}
          <button
            onClick={handleInstallFalco}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 text-xs font-medium hover:bg-purple-500/30 transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            {t('cards:falcoAlerts.installWithMission')}
          </button>
        </div>
        <ApiKeyPromptModal isOpen={showKeyPrompt} onDismiss={dismissPrompt} onGoToSettings={goToSettings} />
        {pendingPrompt !== null && (
          <ConfirmMissionPromptDialog
            open={pendingPrompt !== null}
            missionTitle={t('cards:falcoAlerts.missionTitle')}
            missionDescription={t('cards:falcoAlerts.missionDescription')}
            initialPrompt={pendingPrompt}
            onCancel={() => setPendingPrompt(null)}
            onConfirm={(editedPrompt) => {
              setPendingPrompt(null)
              startMission({
                title: t('cards:falcoAlerts.missionTitle'),
                description: t('cards:falcoAlerts.missionDescription'),
                type: 'deploy',
                initialPrompt: editedPrompt,
              })
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {demoAlerts.map((alert, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
              alert.severity === 'critical' ? 'bg-red-500/10 text-red-400' :
              alert.severity === 'warning' ? 'bg-yellow-500/10 text-yellow-400' :
              'bg-blue-500/10 text-blue-400'
            }`}
          >
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{alert.message}</p>
              <p className="text-muted-foreground">{alert.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Trivy Vulnerability Scanner ─────────────────────────────────────────

