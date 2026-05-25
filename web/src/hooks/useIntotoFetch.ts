/**
 * Fetch orchestration for in-toto supply chain security data.
 *
 * Exports cache helpers, single-cluster fetch logic, and cache data types
 * used by useIntoto.
 */

import { kubectlProxy } from '../lib/kubectlProxy'
import { STORAGE_KEY_INTOTO_CACHE, STORAGE_KEY_INTOTO_CACHE_TIME } from '../lib/constants/storage'
import { CRD_CHECK_TIMEOUT_MS, CRD_DATA_FETCH_TIMEOUT_MS } from '../lib/constants/network'
import {
  IntotoClusterStatus,
  IntotoLayout,
  IntotoStep,
  IntotoLayoutResource,
  IntotoLinkResource,
  computeIntotoStats,
  safeJsonParse,
  emptyStatus,
} from './useIntotoTransform'

// ── Cache types ──────────────────────────────────────────────────────────

export interface CacheData {
  statuses: Record<string, IntotoClusterStatus>
  timestamp: number
}

// ── Cache helpers ────────────────────────────────────────────────────────

export function loadFromCache(): CacheData | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY_INTOTO_CACHE)
    const cacheTime = localStorage.getItem(STORAGE_KEY_INTOTO_CACHE_TIME)
    if (!cached || !cacheTime) return null
    // Stale-while-revalidate: always return cached data. Auto-refresh handles freshness.
    return {
      statuses: safeJsonParse<Record<string, IntotoClusterStatus>>(cached, {}, 'localStorage cache'),
      timestamp: parseInt(cacheTime, 10),
    }
  } catch {
    return null
  }
}

export function saveToCache(statuses: Record<string, IntotoClusterStatus>): void {
  try {
    // Only cache completed (non-loading, non-error) statuses
    const completed = Object.fromEntries(
      Object.entries(statuses).filter(([, s]) => !s.loading && !s.error)
    )
    if (Object.keys(completed).length > 0) {
      localStorage.setItem(STORAGE_KEY_INTOTO_CACHE, JSON.stringify(completed))
      localStorage.setItem(STORAGE_KEY_INTOTO_CACHE_TIME, Date.now().toString())
    }
  } catch {
    // Ignore storage errors
  }
}

/** Clear localStorage cache so stale data doesn't persist across mode transitions */
export function clearCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_INTOTO_CACHE)
    localStorage.removeItem(STORAGE_KEY_INTOTO_CACHE_TIME)
  } catch {
    // Ignore storage errors
  }
}

// ── Single-cluster fetch (used in parallel) ──────────────────────────────

export async function fetchSingleCluster(cluster: string): Promise<IntotoClusterStatus> {
  try {
    // Phase 1: CRD check for in-toto layouts
    const crdCheck = await kubectlProxy.exec(
      ['get', 'crd', 'layouts.in-toto.io', '-o', 'name'],
      { context: cluster, timeout: CRD_CHECK_TIMEOUT_MS }
    )

    if (crdCheck.exitCode !== 0) {
      return emptyStatus(cluster, false)
    }

    // Phase 2: Fetch Layouts
    const layoutResult = await kubectlProxy.exec(
      ['get', 'layouts.in-toto.io', '-A', '-o', 'json'],
      { context: cluster, timeout: CRD_DATA_FETCH_TIMEOUT_MS }
    )

    if (layoutResult.exitCode !== 0) {
      return emptyStatus(
        cluster, true,
        layoutResult.output?.trim() || 'intoto_supply_chain.fetchErrorLayouts'
      )
    }

    const layouts: IntotoLayout[] = []

    if (layoutResult.output) {
      const data = safeJsonParse<{ items?: IntotoLayoutResource[] }>(layoutResult.output, { items: [] }, `${cluster} layouts.in-toto.io`)
      for (const item of (data.items || []) as IntotoLayoutResource[]) {
        const steps: IntotoStep[] = (item.spec.steps || []).map(s => ({
          name: s.name,
          status: 'unknown' as const,
          functionary: (s.pubkeys || []).join(', ') || 'unknown',
          linksFound: 0,
        }))

        layouts.push({
          name: item.metadata.name,
          cluster,
          namespace: item.metadata.namespace,
          steps,
          expectedProducts: steps.length,
          verifiedSteps: 0,
          failedSteps: 0,
          createdAt: item.metadata.creationTimestamp || new Date().toISOString(),
        })
      }
    }

    // Phase 3: Fetch Links to back-populate step verification status
    const linkResult = await kubectlProxy.exec(
      ['get', 'links.in-toto.io', '-A', '-o', 'json'],
      { context: cluster, timeout: CRD_DATA_FETCH_TIMEOUT_MS }
    )

    if (linkResult.exitCode === 0 && linkResult.output) {
      const linkData = safeJsonParse<{ items?: IntotoLinkResource[] }>(linkResult.output, { items: [] }, `${cluster} links.in-toto.io`)
      for (const link of (linkData.items || []) as IntotoLinkResource[]) {
        const layoutName = link.metadata.labels?.['layout-name']
        const stepName = link.spec.name || link.metadata.labels?.['step-name']
        if (!layoutName || !stepName) continue

        const layout = layouts.find(l => l.name === layoutName)
        if (!layout) continue

        const step = layout.steps.find(s => s.name === stepName)
        if (!step) continue

        step.linksFound += 1
        const isVerified = link.status?.verified === true
        const newStatus = isVerified ? 'verified' : 'failed'

        // Undo the previous counter contribution from this step before
        // re-evaluating — a step with multiple links must not be counted twice.
        if (step.status === 'verified') layout.verifiedSteps -= 1
        else if (step.status === 'failed') layout.failedSteps -= 1

        step.status = newStatus
        if (newStatus === 'verified') layout.verifiedSteps += 1
        else layout.failedSteps += 1
      }
    }

    // Mark steps with no links found as missing
    for (const layout of (layouts || [])) {
      for (const step of (layout.steps || [])) {
        if (step.status === 'unknown' && step.linksFound === 0) {
          step.status = 'missing'
        }
      }
    }

    const stats = computeIntotoStats(layouts)

    return {
      cluster,
      installed: true,
      loading: false,
      layouts,
      ...stats,
    }
  } catch (err: unknown) {
    const isDemoError = err instanceof Error && err.message.includes('demo mode')
    if (!isDemoError) {
      console.error(`[useIntoto] Error fetching from ${cluster}:`, err)
    }
    return emptyStatus(
      cluster, false,
      err instanceof Error ? err.message : 'intoto_supply_chain.connectionFailed'
    )
  }
}
