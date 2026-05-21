import { safeGetJSON, safeSetJSON } from '../../../lib/safeLocalStorage'
import { MS_PER_MINUTE } from '../../../lib/constants/time'

/** Storage key for cluster version cache */
const STORAGE_KEY = 'kc-cluster-versions'

/** How long cached versions remain valid before refetch */
export const VERSION_CACHE_TTL = 5 * MS_PER_MINUTE // 5 minutes

/** Debounce interval for persisting the version cache to localStorage */
const PERSIST_DEBOUNCE_MS = 500

/** Module-level cache for cluster versions (persists across component remounts + page refreshes) */
const versionCache: Record<string, { version: string; timestamp: number }> =
  typeof window === 'undefined'
    ? {}
    : safeGetJSON<Record<string, { version: string; timestamp: number }>>(STORAGE_KEY, {})

/** Persist cache to localStorage (debounced to avoid excessive writes) */
let persistTimer: ReturnType<typeof setTimeout> | null = null
function persistCache() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    safeSetJSON(STORAGE_KEY, versionCache)
  }, PERSIST_DEBOUNCE_MS)
}

/** Get cached version if still valid */
export function getCachedVersion(clusterName: string): string | null {
  const cached = versionCache[clusterName]
  if (cached && Date.now() - cached.timestamp < VERSION_CACHE_TTL) {
    return cached.version
  }
  return null
}

/** Get cached version regardless of TTL (for stale-while-revalidate on page refresh) */
export function getStaleCachedVersion(clusterName: string): string | null {
  return versionCache[clusterName]?.version ?? null
}

/** Set cached version */
export function setCachedVersion(clusterName: string, version: string) {
  versionCache[clusterName] = { version, timestamp: Date.now() }
  persistCache()
}

/** Clear version from cache (used on cluster list refresh) */
export function clearCachedVersion(clusterName: string) {
  delete versionCache[clusterName]
}

/** Persist the cache immediately (used before periodic refresh) */
export function flushVersionCache() {
  persistCache()
}

/** Derive the latest known Kubernetes minor version from cluster data.
 * Falls back to a hardcoded value when no cluster versions are available. */
const FALLBACK_LATEST_MINOR = 33

export function deriveLatestMinor(versions: Record<string, string>): number {
  let maxMinor = 0
  for (const version of Object.values(versions)) {
    const match = version.match(/v?(\d+)\.(\d+)\.(\d+)/)
    if (match) {
      const minor = parseInt(match[2], 10)
      if (minor > maxMinor) maxMinor = minor
    }
  }
  // The latest available minor is at least one ahead of the highest observed,
  // since clusters are rarely all on the very latest release.
  // If no versions were parsed, fall back to the hardcoded value.
  return maxMinor > 0 ? maxMinor + 1 : FALLBACK_LATEST_MINOR
}

/** Check if a newer stable version is available */
export function getRecommendedUpgrade(currentVersion: string, latestMinor: number): string | null {
  if (!currentVersion || currentVersion === '-' || currentVersion === 'loading...') return null

  // Parse version (e.g., "v1.28.5" -> { major: 1, minor: 28, patch: 5 })
  const match = currentVersion.match(/v?(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null

  const minor = parseInt(match[2], 10)
  const patch = parseInt(match[3], 10)

  if (minor < latestMinor - 2) {
    // More than 2 minor versions behind - suggest next minor
    return `v1.${minor + 1}.0`
  } else if (minor < latestMinor && patch < 10) {
    // Behind on minor, suggest latest patch of current minor
    return `v1.${minor}.${patch + 1}`
  }

  return null // Up to date
}

/** Demo versions keyed by cluster name keywords */
const DEMO_VERSIONS: Record<string, string> = {
  eks: 'v1.31.2',
  aks: 'v1.30.4',
  gke: 'v1.31.0',
  openshift: 'v1.28.11',
  oci: 'v1.30.1',
  kind: 'v1.32.0',
  k3s: 'v1.31.1',
  minikube: 'v1.31.3',
  rancher: 'v1.29.6' }

export function getDemoVersionForCluster(name: string): string {
  const lower = name.toLowerCase()
  for (const [keyword, version] of Object.entries(DEMO_VERSIONS)) {
    if (lower.includes(keyword)) return version
  }
  // Deterministic fallback based on name length
  const versions = ['v1.30.2', 'v1.31.1', 'v1.29.8', 'v1.32.0', 'v1.30.5']
  return versions[name.length % versions.length]
}

/** Build the upgrade mission prompt */
export function buildUpgradePrompt(clusterName: string, currentVersion: string, targetVersion: string): string {
  return `I want to upgrade the Kubernetes cluster "${clusterName}" from version ${currentVersion} to ${targetVersion}.

Please help me with this upgrade by:
1. First checking the cluster's current state and any prerequisites
2. Reviewing the upgrade path and potential breaking changes
3. Creating a backup/rollback plan
4. Performing the upgrade with proper monitoring
5. Validating the upgrade was successful

Please proceed step by step and ask for confirmation before making any changes.`
}
