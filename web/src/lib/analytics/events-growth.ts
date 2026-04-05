// ── Growth, Engagement & Landing Page Events ──────────────────────

import { send } from './core'

// ── Widget Tracking ─────────────────────────────────────────────────

/** Fired once when the PWA mini-dashboard mounts (tracks active widget users) */
export function emitWidgetLoaded(mode: 'standalone' | 'browser') {
  send('ksc_widget_loaded', { mode })
}

/** Fired when a user clicks a stat card in the widget to open the full console */
export function emitWidgetNavigation(targetPath: string) {
  send('ksc_widget_navigation', { target_path: targetPath })
}

/** Fired when the PWA install prompt is accepted */
export function emitWidgetInstalled(method: 'pwa-prompt' | 'safari-dock') {
  send('ksc_widget_installed', { method })
}

/** Fired when the Übersicht widget JSX file is downloaded from settings */
export function emitWidgetDownloaded(widgetType: 'uebersicht' | 'browser') {
  send('ksc_widget_downloaded', { widget_type: widgetType })
}

// ── Engagement Nudges ────────────────────────────────────────────────

/** Fired when contextual nudge is shown to user */
export function emitNudgeShown(nudgeType: string) {
  send('ksc_nudge_shown', { nudge_type: nudgeType })
}

/** Fired when user dismisses a contextual nudge */
export function emitNudgeDismissed(nudgeType: string) {
  send('ksc_nudge_dismissed', { nudge_type: nudgeType })
}

/** Fired when user acts on a contextual nudge (e.g. clicks "Add card") */
export function emitNudgeActioned(nudgeType: string) {
  send('ksc_nudge_actioned', { nudge_type: nudgeType })
}

/** Fired when smart card suggestions are shown after agent connects */
export function emitSmartSuggestionsShown(cardCount: number) {
  send('ksc_smart_suggestions_shown', { card_count: cardCount })
}

/** Fired when user adds a card from smart suggestions */
export function emitSmartSuggestionAccepted(cardType: string) {
  send('ksc_smart_suggestion_accepted', { card_type: cardType })
}

/** Fired when user adds all suggested cards at once */
export function emitSmartSuggestionsAddAll(cardCount: number) {
  send('ksc_smart_suggestions_add_all', { card_count: cardCount })
}

// ── Card Recommendations (dashboard panel) ──────────────────────────

/** Fired when the "Recommended Cards for your clusters" panel renders */
export function emitCardRecommendationsShown(cardCount: number, highPriorityCount: number) {
  send('ksc_card_recommendations_shown', { card_count: cardCount, high_priority_count: highPriorityCount })
}

/** Fired when user adds a card from the recommendations panel */
export function emitCardRecommendationActioned(cardType: string, priority: string) {
  send('ksc_card_recommendation_actioned', { card_type: cardType, priority })
}

// ── Mission Suggestions (dashboard panel) ───────────────────────────

/** Fired when the "Recommended Actions for your clusters" panel renders */
export function emitMissionSuggestionsShown(count: number, criticalCount: number) {
  send('ksc_mission_suggestions_shown', { suggestion_count: count, critical_count: criticalCount })
}

/** Fired when user starts an action from the mission suggestions panel */
export function emitMissionSuggestionActioned(missionType: string, priority: string, action: string) {
  send('ksc_mission_suggestion_actioned', { mission_type: missionType, priority, action })
}

// ── Marketplace Browsing ─────────────────────────────────────────

/** Fired when user views a marketplace item detail */
export function emitMarketplaceItemViewed(itemType: string, itemName: string) {
  send('ksc_marketplace_item_viewed', { item_type: itemType, item_name: itemName })
}

// ── Insights ─────────────────────────────────────────────────────

/** Fired when user views an insight card detail */
export function emitInsightViewed(insightCategory: string) {
  send('ksc_insight_viewed', { insight_category: insightCategory })
}

// ── Arcade Games ────────────────────────────────────────────────

/** Fired when user starts or restarts an arcade game */
export function emitGameStarted(gameName: string) {
  send('ksc_game_started', { game_name: gameName })
}

/** Fired when a game ends (win, loss, or completion) */
export function emitGameEnded(gameName: string, outcome: string, score: number) {
  send('ksc_game_ended', { game_name: gameName, outcome, score })
}

// ── Sidebar Navigation ──────────────────────────────────────────

/** Fired when user clicks a sidebar navigation item */
export function emitSidebarNavigated(destination: string) {
  send('ksc_sidebar_navigated', { destination })
}

// ── Feature Hints ───────────────────────────────────────────────────

/** Fired when a contextual feature hint tooltip appears */
export function emitFeatureHintShown(hintType: string) {
  send('ksc_feature_hint_shown', { hint_type: hintType })
}

/** Fired when user dismisses a feature hint tooltip */
export function emitFeatureHintDismissed(hintType: string) {
  send('ksc_feature_hint_dismissed', { hint_type: hintType })
}

/** Fired when user clicks the CTA on a feature hint tooltip */
export function emitFeatureHintActioned(hintType: string) {
  send('ksc_feature_hint_actioned', { hint_type: hintType })
}

// ── Getting Started Banner ──────────────────────────────────────────

/** Fired when the Getting Started banner renders on main dashboard */
export function emitGettingStartedShown() {
  send('ksc_getting_started_shown')
}

/** Fired when user clicks one of the Getting Started quick-action buttons */
export function emitGettingStartedActioned(action: string) {
  send('ksc_getting_started_actioned', { action })
}

// ── Post-Connect Activation ──────────────────────────────────────────

/** Fired when the post-agent-connect activation banner renders */
export function emitPostConnectShown() {
  send('ksc_post_connect_shown')
}

/** Fired when user clicks a CTA on the post-connect activation banner */
export function emitPostConnectActioned(action: string) {
  send('ksc_post_connect_actioned', { action })
}

// ── Demo-to-Local CTA ──────────────────────────────────────────────

/** Fired when the "Try it locally" CTA renders for demo-site visitors */
export function emitDemoToLocalShown() {
  send('ksc_demo_to_local_shown')
}

/** Fired when a demo-site visitor clicks the install CTA */
export function emitDemoToLocalActioned(action: string) {
  send('ksc_demo_to_local_actioned', { action })
}

// ── Adopter Nudge ─────────────────────────────────────────────────

/** Fired when the adopter nudge banner renders */
export function emitAdopterNudgeShown() {
  send('ksc_adopter_nudge_shown')
}

/** Fired when user clicks the adopter nudge CTA */
export function emitAdopterNudgeActioned(action: string) {
  send('ksc_adopter_nudge_actioned', { action })
}

// ── Insight Actions ─────────────────────────────────────────────

/** Fired when an insight is acknowledged */
export function emitInsightAcknowledged(insightCategory: string, insightSeverity: string) {
  send('ksc_insight_acknowledged', { insight_category: insightCategory, insight_severity: insightSeverity })
}

/** Fired when an insight is dismissed */
export function emitInsightDismissed(insightCategory: string, insightSeverity: string) {
  send('ksc_insight_dismissed', { insight_category: insightCategory, insight_severity: insightSeverity })
}

/** Fired when an inline action button is clicked */
export function emitActionClicked(actionType: string, sourceCard: string, dashboard: string) {
  send('ksc_action_clicked', { action_type: actionType, source_card: sourceCard, dashboard })
}

/** Fired when the AI suggestion/remediation tab is viewed */
export function emitAISuggestionViewed(insightCategory: string, hasAIEnrichment: boolean) {
  send('ksc_ai_suggestion_viewed', { insight_category: insightCategory, has_ai_enrichment: hasAIEnrichment })
}

// ── Welcome / Conference Landing Page ────────────────────────────────

/** Fired once when /welcome is rendered */
export function emitWelcomeViewed(ref: string) {
  send('ksc_welcome_viewed', { ref })
}

/** Fired on CTA button clicks (hero_explore_demo, hero_github, scenario_*, footer_*) */
export function emitWelcomeActioned(action: string, ref: string) {
  send('ksc_welcome_actioned', { action, ref })
}

// ── From Lens Landing Page ──────────────────────────────────────────

/** Fired when a user views the /from-lens landing page */
export function emitFromLensViewed() {
  send('ksc_from_lens_viewed')
}

/** Fired when a user interacts with a CTA on the /from-lens page */
export function emitFromLensActioned(action: string) {
  send('ksc_from_lens_actioned', { action })
}

/** Fired when a user switches deployment tabs (localhost / cluster-portforward / cluster-ingress) */
export function emitFromLensTabSwitch(tab: string) {
  send('ksc_from_lens_tab_switch', { tab })
}

/** Fired when a user copies an install command from the /from-lens page */
export function emitFromLensCommandCopy(tab: string, step: number, command: string) {
  send('ksc_from_lens_command_copy', { tab, step, command })
}

// ── From Headlamp Landing Page ──────────────────────────────────────

/** Fired once when /from-headlamp is rendered */
export function emitFromHeadlampViewed() {
  send('ksc_from_headlamp_viewed')
}

/** Fired on CTA button clicks */
export function emitFromHeadlampActioned(action: string) {
  send('ksc_from_headlamp_actioned', { action })
}

/** Fired when switching deployment tabs */
export function emitFromHeadlampTabSwitch(tab: string) {
  send('ksc_from_headlamp_tab_switch', { tab })
}

/** Fired when a user copies an install command from the /from-headlamp page */
export function emitFromHeadlampCommandCopy(tab: string, step: number, command: string) {
  send('ksc_from_headlamp_command_copy', { tab, step, command })
}

// ── White Label Landing Page ──────────────────────────────────────────

/** Fired once when /white-label is rendered */
export function emitWhiteLabelViewed() {
  send('ksc_white_label_viewed')
}

/** Fired on CTA button clicks */
export function emitWhiteLabelActioned(action: string) {
  send('ksc_white_label_actioned', { action })
}

/** Fired when switching deployment tabs (binary, helm, docker) */
export function emitWhiteLabelTabSwitch(tab: string) {
  send('ksc_white_label_tab_switch', { tab })
}

/** Fired when a user copies a command from the /white-label page */
export function emitWhiteLabelCommandCopy(tab: string, step: number, command: string) {
  send('ksc_white_label_command_copy', { tab, step, command })
}

// ── Rotating Tips ─────────────────────────────────────────────────

/** Fired when a rotating "Did you know?" tip is displayed on a page */
export function emitTipShown(page: string, tip: string) {
  send('ksc_tip_shown', { page, tip })
}

/** Fired when user's visit streak increments (consecutive days visiting) */
export function emitStreakDay(streakCount: number) {
  send('ksc_streak_day', { streak_count: streakCount })
}
