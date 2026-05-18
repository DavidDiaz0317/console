/**
 * Compliance cards backed by live data hooks.
 *
 * Each card detects whether the corresponding tool is installed in connected
 * clusters. When installed, it displays real per-cluster data. When not
 * installed, it falls back to demo data and offers an AI mission install link.
 */

export { ComplianceScore } from './ComplianceScoreCard'
export { FalcoAlerts } from './FalcoAlertsCard'
export { KubescapeScan } from './KubescapeScanCard'
export { PolicyViolations } from './PolicyViolationsCard'
export { TrivyScan } from './TrivyScanCard'
