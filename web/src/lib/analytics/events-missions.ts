// ── Mission, Auth, Feedback & Settings Events ─────────────────────

import { send, setAnalyticsUserProperties } from './core'

// ── AI Missions ────────────────────────────────────────────────────

export function emitMissionStarted(missionType: string, agentProvider: string) {
  send('ksc_mission_started', { mission_type: missionType, agent_provider: agentProvider })
}

export function emitMissionCompleted(missionType: string, durationSec: number) {
  send('ksc_mission_completed', { mission_type: missionType, duration_sec: durationSec })
}

export function emitMissionError(missionType: string, errorCode: string) {
  send('ksc_mission_error', { mission_type: missionType, error_code: errorCode })
}

export function emitMissionRated(missionType: string, rating: string) {
  send('ksc_mission_rated', { mission_type: missionType, rating })
}

// ── Mission Browser / Knowledge Base ──────────────────────────────

export function emitFixerSearchStarted(clusterConnected: boolean) {
  send('ksc_fixer_search', { cluster_connected: clusterConnected })
}

export function emitFixerSearchCompleted(found: number, scanned: number) {
  send('ksc_fixer_search_done', { found, scanned })
}

export function emitFixerBrowsed(path: string) {
  send('ksc_fixer_browsed', { path })
}

export function emitFixerViewed(title: string, cncfProject?: string) {
  send('ksc_fixer_viewed', { title, cncf_project: cncfProject ?? '' })
}

export function emitFixerImported(title: string, cncfProject?: string) {
  send('ksc_fixer_imported', { title, cncf_project: cncfProject ?? '' })
}

export function emitFixerImportError(title: string, errorCount: number, firstError: string) {
  send('ksc_fixer_import_error', {
    title,
    error_count: String(errorCount),
    first_error: firstError.slice(0, 100),
  })
}

export function emitFixerLinkCopied(title: string, cncfProject?: string) {
  send('ksc_fixer_link_copied', { title, cncf_project: cncfProject ?? '' })
}

export function emitFixerGitHubLink() {
  send('ksc_fixer_github_link')
}

// ── Auth ───────────────────────────────────────────────────────────

export function emitLogin(method: string) {
  send('login', { method })
}

export function emitLogout() {
  send('ksc_logout')
}

// ── Feedback ───────────────────────────────────────────────────────

export function emitFeedbackSubmitted(type: string) {
  send('ksc_feedback_submitted', { feedback_type: type })
}

export function emitScreenshotAttached(method: 'paste' | 'drop' | 'file_picker', count: number) {
  send('ksc_screenshot_attached', { method, count })
}

export function emitScreenshotUploadFailed(error: string, screenshotCount: number) {
  send('ksc_screenshot_upload_failed', { error: error.substring(0, 100), screenshot_count: screenshotCount })
}

export function emitScreenshotUploadSuccess(screenshotCount: number) {
  send('ksc_screenshot_upload_success', { screenshot_count: screenshotCount })
}

// ── Tour ───────────────────────────────────────────────────────────

export function emitTourStarted() {
  send('ksc_tour_started')
}

export function emitTourCompleted(stepCount: number) {
  send('ksc_tour_completed', { step_count: stepCount })
}

export function emitTourSkipped(atStep: number) {
  send('ksc_tour_skipped', { at_step: atStep })
}

// ── Marketplace ────────────────────────────────────────────────────

export function emitMarketplaceInstall(itemType: string, itemName: string) {
  send('ksc_marketplace_install', { item_type: itemType, item_name: itemName })
}

export function emitMarketplaceRemove(itemType: string) {
  send('ksc_marketplace_remove', { item_type: itemType })
}

/** Fired when a marketplace install attempt fails */
export function emitMarketplaceInstallFailed(itemType: string, itemName: string, error: string) {
  send('ksc_marketplace_install_failed', { item_type: itemType, item_name: itemName, error_detail: error.slice(0, 100) })
}

// ── Theme ─────────────────────────────────────────────────────────

/** Fired when user changes theme via settings dropdown or navbar toggle */
export function emitThemeChanged(themeId: string, source: string) {
  send('ksc_theme_changed', { theme_id: themeId, source })
}

// ── Language ──────────────────────────────────────────────────────

/** Fired when user changes UI language */
export function emitLanguageChanged(langCode: string) {
  send('ksc_language_changed', { language: langCode })
}

// ── AI Settings ───────────────────────────────────────────────────

/** Fired when user changes AI mode (low/medium/high) */
export function emitAIModeChanged(mode: string) {
  send('ksc_ai_mode_changed', { mode })
}

/** Fired when user toggles AI predictions on/off */
export function emitAIPredictionsToggled(enabled: boolean) {
  send('ksc_ai_predictions_toggled', { enabled: String(enabled) })
}

/** Fired when user changes prediction confidence threshold */
export function emitConfidenceThresholdChanged(value: number) {
  send('ksc_confidence_threshold_changed', { threshold: value })
}

/** Fired when user toggles consensus (multi-provider) mode */
export function emitConsensusModeToggled(enabled: boolean) {
  send('ksc_consensus_mode_toggled', { enabled: String(enabled) })
}

// ── GitHub Token ───────────────────────────────────────────────────

export function emitGitHubTokenConfigured() {
  send('ksc_github_token_configured')
}

export function emitGitHubTokenRemoved() {
  send('ksc_github_token_removed')
}

// ── API Provider ───────────────────────────────────────────────────

export function emitApiProviderConnected(provider: string) {
  send('ksc_api_provider_connected', { provider })
}

// ── Demo Mode ──────────────────────────────────────────────────────

export function emitDemoModeToggled(enabled: boolean) {
  send('ksc_demo_mode_toggled', { enabled: String(enabled) })
  setAnalyticsUserProperties({ demo_mode: String(enabled) })
}

// ── Prediction Feedback ──────────────────────────────────────────

/** Fired when user gives thumbs up/down on a prediction */
export function emitPredictionFeedbackSubmitted(feedback: string, predictionType: string, provider?: string) {
  send('ksc_prediction_feedback', { feedback, prediction_type: predictionType, provider: provider ?? 'unknown' })
}

// ── Snooze ───────────────────────────────────────────────────────

/** Fired when user snoozes a card, alert, mission, or recommendation */
export function emitSnoozed(targetType: string, duration?: string) {
  send('ksc_snoozed', { target_type: targetType, duration: duration ?? 'default' })
}

/** Fired when user unsnoozes an item */
export function emitUnsnoozed(targetType: string) {
  send('ksc_unsnoozed', { target_type: targetType })
}
