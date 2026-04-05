// ── UI Interaction Events ──────────────────────────────────────────

import { send } from './core'

// ── Dashboard & Cards ──────────────────────────────────────────────

export function emitCardAdded(cardType: string, source: string) {
  send('ksc_card_added', { card_type: cardType, source })
}

export function emitCardRemoved(cardType: string) {
  send('ksc_card_removed', { card_type: cardType })
}

export function emitCardExpanded(cardType: string) {
  send('ksc_card_expanded', { card_type: cardType })
}

export function emitCardDragged(cardType: string) {
  send('ksc_card_dragged', { card_type: cardType })
}

export function emitCardConfigured(cardType: string) {
  send('ksc_card_configured', { card_type: cardType })
}

export function emitCardReplaced(oldType: string, newType: string) {
  send('ksc_card_replaced', { old_type: oldType, new_type: newType })
}

// ── Global Search (Cmd+K) ─────────────────────────────────────────────

/** Fired when user opens the global search dialog (Cmd+K, Ctrl+K, or click) */
export function emitGlobalSearchOpened(method: 'keyboard' | 'click') {
  send('ksc_global_search_opened', { method })
}

/** Fired when user executes a search query (debounced — fires once per search session on blur) */
export function emitGlobalSearchQueried(queryLength: number, resultCount: number) {
  send('ksc_global_search_queried', { query_length: queryLength, result_count: resultCount })
}

/** Fired when user selects a result from global search */
export function emitGlobalSearchSelected(category: string, resultIndex: number) {
  send('ksc_global_search_selected', { category, result_index: resultIndex })
}

/** Fired when user chooses "Ask AI" from global search */
export function emitGlobalSearchAskAI(queryLength: number) {
  send('ksc_global_search_ask_ai', { query_length: queryLength })
}

// ── Card Interactions (framework-level) ──────────────────────────────
// These fire automatically from shared UI components (CardControls,
// CardSearchInput, CardClusterFilter) so all cards get consistent
// tracking without per-card instrumentation.

/** Fired when user changes sort field in a card's controls */
export function emitCardSortChanged(sortField: string, cardType: string) {
  send('ksc_card_sort_changed', { sort_field: sortField, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user toggles sort direction in a card's controls */
export function emitCardSortDirectionChanged(direction: string, cardType: string) {
  send('ksc_card_sort_direction_changed', { direction, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user changes the item limit in a card's controls */
export function emitCardLimitChanged(limit: string, cardType: string) {
  send('ksc_card_limit_changed', { limit, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user types in a card's search input (debounced — fires once per search session) */
export function emitCardSearchUsed(queryLength: number, cardType: string) {
  send('ksc_card_search_used', { query_length: queryLength, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user changes cluster filter selection in a card */
export function emitCardClusterFilterChanged(selectedCount: number, totalCount: number, cardType: string) {
  send('ksc_card_cluster_filter_changed', {
    selected_count: selectedCount,
    total_count: totalCount,
    card_type: cardType,
    page_path: window.location.pathname,
  })
}

/** Fired when user navigates pages via pagination controls */
export function emitCardPaginationUsed(page: number, totalPages: number, cardType: string) {
  send('ksc_card_pagination_used', { page, total_pages: totalPages, card_type: cardType, page_path: window.location.pathname })
}

/** Fired when user clicks a list item row in a card */
export function emitCardListItemClicked(cardType: string) {
  send('ksc_card_list_item_clicked', { card_type: cardType, page_path: window.location.pathname })
}

// ── "Almost" Action Tracking ────────────────────────────────────────
// These track user intent signals — users who almost engaged but didn't.
// Helps distinguish discovery problems from conversion problems.

/** Fired when add-card modal is opened (tracks intent to add) */
export function emitAddCardModalOpened() {
  send('ksc_add_card_modal_opened')
}

/** Fired when add-card modal is closed without adding any cards */
export function emitAddCardModalAbandoned() {
  send('ksc_add_card_modal_abandoned')
}

/** Fired when user scrolls the dashboard card grid (debounced) */
export function emitDashboardScrolled(depth: 'shallow' | 'deep') {
  send('ksc_dashboard_scrolled', { depth })
}

/** Fired when PWA install prompt is shown */
export function emitPwaPromptShown() {
  send('ksc_pwa_prompt_shown')
}

/** Fired when PWA install prompt is dismissed */
export function emitPwaPromptDismissed() {
  send('ksc_pwa_prompt_dismissed')
}

// ── LinkedIn Share ─────────────────────────────────────────────────

/** Fired when user clicks a LinkedIn share button */
export function emitLinkedInShare(source: string) {
  send('ksc_linkedin_share', { source })
}

// ── Drill-Down ───────────────────────────────────────────────────

/** Fired when user opens a drill-down view (pod, cluster, namespace, etc.) */
export function emitDrillDownOpened(viewType: string) {
  send('ksc_drill_down_opened', { view_type: viewType })
}

/** Fired when user closes the drill-down modal */
export function emitDrillDownClosed(viewType: string, depth: number) {
  send('ksc_drill_down_closed', { view_type: viewType, depth })
}

// ── Card Refresh ─────────────────────────────────────────────────

/** Fired when user clicks the manual refresh button on a card */
export function emitCardRefreshed(cardType: string) {
  send('ksc_card_refreshed', { card_type: cardType })
}

// ── Global Filters ───────────────────────────────────────────────

/** Fired when user changes global cluster filter */
export function emitGlobalClusterFilterChanged(selectedCount: number, totalCount: number) {
  send('ksc_global_cluster_filter_changed', { selected_count: selectedCount, total_count: totalCount })
}

/** Fired when user changes global severity filter */
export function emitGlobalSeverityFilterChanged(selectedCount: number) {
  send('ksc_global_severity_filter_changed', { selected_count: selectedCount })
}

/** Fired when user changes global status filter */
export function emitGlobalStatusFilterChanged(selectedCount: number) {
  send('ksc_global_status_filter_changed', { selected_count: selectedCount })
}

// ── Dashboard CRUD ───────────────────────────────────────────────

/** Fired when user creates a new dashboard */
export function emitDashboardCreated(name: string) {
  send('ksc_dashboard_created', { dashboard_name: name })
}

/** Fired when user deletes a dashboard */
export function emitDashboardDeleted() {
  send('ksc_dashboard_deleted')
}

/** Fired when user renames a dashboard */
export function emitDashboardRenamed() {
  send('ksc_dashboard_renamed')
}

/** Fired when user imports a dashboard */
export function emitDashboardImported() {
  send('ksc_dashboard_imported')
}

/** Fired when user exports a dashboard */
export function emitDashboardExported() {
  send('ksc_dashboard_exported')
}

// ── Data Export ──────────────────────────────────────────────────

/** Fired when user downloads or copies data from a drill-down view */
export function emitDataExported(exportType: string, resourceType?: string) {
  send('ksc_data_exported', { export_type: exportType, resource_type: resourceType ?? '' })
}

// ── Dashboard Duration ──────────────────────────────────────────────

/** Fired when user navigates away from a dashboard, recording time spent */
export function emitDashboardViewed(dashboardId: string, durationMs: number) {
  send('ksc_dashboard_viewed', { dashboard_id: dashboardId, duration_ms: durationMs })
}

// ── Card Modal Browsing ─────────────────────────────────────────────

/** Fired when user expands a category in the add-card modal */
export function emitCardCategoryBrowsed(category: string) {
  send('ksc_card_category_browsed', { category })
}

/** Fired when the "Recommended for you" section renders in add-card modal */
export function emitRecommendedCardShown(cardTypes: string[]) {
  send('ksc_recommended_cards_shown', {
    card_count: cardTypes.length,
    card_types: cardTypes.join(','),
  })
}

// ── Dashboard Excellence: Modal & Action Events ─────────────────────

/** Fired when any detail modal is opened */
export function emitModalOpened(modalType: string, sourceCard: string) {
  send('ksc_modal_opened', { modal_type: modalType, source_card: sourceCard })
}

/** Fired when a tab is viewed within a modal */
export function emitModalTabViewed(modalType: string, tabName: string) {
  send('ksc_modal_tab_viewed', { modal_type: modalType, tab_name: tabName })
}

/** Fired when a modal is closed, with duration */
export function emitModalClosed(modalType: string, durationMs: number) {
  send('ksc_modal_closed', { modal_type: modalType, duration_ms: durationMs })
}
