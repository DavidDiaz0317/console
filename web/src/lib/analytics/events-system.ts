// ── System & Infrastructure Events ────────────────────────────────

import { send, setAnalyticsUserProperties, getDeploymentType } from './core'
import { isDemoMode } from '../demoMode'

// ── kc-agent Connection ─────────────────────────────────────────

export function emitAgentConnected(version: string, clusterCount: number) {
  send('ksc_agent_connected', { agent_version: version, cluster_count: clusterCount })
}

export function emitAgentDisconnected() {
  send('ksc_agent_disconnected')
}

/**
 * Emitted when cluster inventory changes. Sends only aggregate counts —
 * NEVER cluster names, IPs, servers, or any identifiable information.
 */
export function emitClusterInventory(counts: {
  total: number
  healthy: number
  unhealthy: number
  unreachable: number
  distributions: Record<string, number>
}) {
  const distParams: Record<string, string | number> = {}
  for (const [dist, count] of Object.entries(counts.distributions)) {
    distParams[`dist_${dist}`] = count
  }
  send('ksc_cluster_inventory', {
    cluster_count: counts.total,
    healthy_count: counts.healthy,
    unhealthy_count: counts.unhealthy,
    unreachable_count: counts.unreachable,
    ...distParams,
  })
  setAnalyticsUserProperties({ cluster_count: String(counts.total) })
}

// ── Agent Provider Detection ────────────────────────────────────

/** Capability bitmask values matching Go ProviderCapability constants */
const CAPABILITY_CHAT = 1
const CAPABILITY_TOOL_EXEC = 2

export interface ProviderSummary {
  name: string
  displayName: string
  capabilities: number
}

/**
 * Fired when kc-agent connects with the list of available AI providers.
 */
export function emitAgentProvidersDetected(providers: ProviderSummary[]) {
  if (!providers || providers.length === 0) return

  const cliProviders = (providers || [])
    .filter(p => (p.capabilities & CAPABILITY_TOOL_EXEC) !== 0)
    .map(p => p.name)
  const apiProviders = (providers || [])
    .filter(p => (p.capabilities & CAPABILITY_TOOL_EXEC) === 0 && (p.capabilities & CAPABILITY_CHAT) !== 0)
    .map(p => p.name)

  send('ksc_agent_providers_detected', {
    provider_count: providers.length,
    cli_providers: cliProviders.join(',') || 'none',
    api_providers: apiProviders.join(',') || 'none',
    cli_count: cliProviders.length,
    api_count: apiProviders.length,
  })
}

// ── API Key Configuration ───────────────────────────────────────

export function emitApiKeyConfigured(provider: string) {
  send('ksc_api_key_configured', { provider })
}

export function emitApiKeyRemoved(provider: string) {
  send('ksc_api_key_removed', { provider })
}

// ── Install Command Copied ──────────────────────────────────────

/** Source labels for install command copy events */
export type InstallCopySource =
  | 'setup_quickstart'
  | 'setup_dev_mode'
  | 'setup_k8s_deploy'
  | 'setup_oauth_env'
  | 'setup_oauth_restart'
  | 'agent_install_banner'
  | 'demo_to_local'
  | 'from_lens'
  | 'from_headlamp'
  | 'from_holmesgpt'
  | 'feature_inspektorgadget'
  | 'white_label'

export function emitInstallCommandCopied(source: InstallCopySource, command: string) {
  send('ksc_install_command_copied', { source, command })
}

// ── Conversion Funnel ───────────────────────────────────────────

export function emitConversionStep(
  step: number,
  stepName: string,
  details?: Record<string, string>,
) {
  send('ksc_conversion_step', {
    step_number: step,
    step_name: stepName,
    ...details,
  })
}

// ── Deploy ─────────────────────────────────────────────────────────

export function emitDeployWorkload(workloadName: string, clusterGroup: string) {
  send('ksc_deploy_workload', { workload_name: workloadName, cluster_group: clusterGroup })
}

export function emitDeployTemplateApplied(templateName: string) {
  send('ksc_deploy_template_applied', { template_name: templateName })
}

// ── Compliance ─────────────────────────────────────────────────────

export function emitComplianceDrillDown(statType: string) {
  send('ksc_compliance_drill_down', { stat_type: statType })
}

export function emitComplianceFilterChanged(filterType: string) {
  send('ksc_compliance_filter_changed', { filter_type: filterType })
}

// ── Benchmarks ─────────────────────────────────────────────────────

export function emitBenchmarkViewed(benchmarkType: string) {
  send('ksc_benchmark_viewed', { benchmark_type: benchmarkType })
}

// ── Cluster Lifecycle ───────────────────────────────────────────────

/** Fired when a user successfully adds a cluster via the Add Cluster dialog */
export function emitClusterCreated(clusterName: string, authType: string) {
  send('ksc_cluster_created', { cluster_name: clusterName, auth_type: authType })
}

// ── GitHub OAuth ────────────────────────────────────────────────────

/** Fired when a user completes GitHub OAuth login (token received) */
export function emitGitHubConnected() {
  send('ksc_github_connected')
}

// ── Cluster Admin ──────────────────────────────────────────────────

export function emitClusterAction(action: string, clusterName: string) {
  send('ksc_cluster_action', { action, cluster_name: clusterName })
}

export function emitClusterStatsDrillDown(statType: string) {
  send('ksc_cluster_stats_drill_down', { stat_type: statType })
}

// ── Session Context ──────────────────────────────────────────────

const SESSION_START_KEY = '_ksc_session_start_sent'

export function emitSessionContext(installMethod: string, updateChannel: string) {
  setAnalyticsUserProperties({
    install_method: installMethod,
    update_channel: updateChannel,
  })

  if (sessionStorage.getItem(SESSION_START_KEY)) return
  sessionStorage.setItem(SESSION_START_KEY, '1')

  send('ksc_session_start', {
    install_method: installMethod,
    update_channel: updateChannel,
  })
}

// ── Settings: Update ──────────────────────────────────────────────

/** Fired when user clicks "Check for Updates" in settings */
export function emitUpdateChecked() {
  send('ksc_update_checked')
}

/** Fired when user clicks "Update Now" to trigger an update */
export function emitUpdateTriggered() {
  send('ksc_update_triggered')
}

/** Fired when kc-agent reports the update completed successfully */
export function emitUpdateCompleted(durationMs: number) {
  send('ksc_update_completed', { duration_ms: durationMs })
}

/** Fired when kc-agent reports the update failed */
export function emitUpdateFailed(error: string) {
  send('ksc_update_failed', { error_detail: error.slice(0, 100) })
}

/** Fired when user clicks "Refresh to load new version" after a successful update */
export function emitUpdateRefreshed() {
  send('ksc_update_refreshed')
}

/** Fired when the stale-update timeout fires (no WebSocket progress within threshold) */
export function emitUpdateStalled() {
  send('ksc_update_stalled')
}

// ── User Management ──────────────────────────────────────────────

/** Fired when admin changes a user's role */
export function emitUserRoleChanged(newRole: string) {
  send('ksc_user_role_changed', { new_role: newRole })
}

/** Fired when admin removes a user */
export function emitUserRemoved() {
  send('ksc_user_removed')
}

// ── Local Cluster ─────────────────────────────────────────────────

/** Fired when user creates a local cluster (kind, k3d, minikube) */
export function emitLocalClusterCreated(tool: string) {
  send('ksc_local_cluster_created', { tool })
}

// ── Developer Session ──────────────────────────────────────────────

const DEV_SESSION_KEY = 'ksc-dev-session-sent'

export function emitDeveloperSession() {
  if (localStorage.getItem(DEV_SESSION_KEY)) return
  const dep = getDeploymentType()
  if (dep !== 'localhost') return
  if (isDemoMode() && !localStorage.getItem('ksc-token')) return
  localStorage.setItem(DEV_SESSION_KEY, '1')
  send('ksc_developer_session', { deployment_type: dep })
}
