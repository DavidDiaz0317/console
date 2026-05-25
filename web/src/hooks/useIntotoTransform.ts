/**
 * Data transformation utilities for in-toto supply chain security.
 *
 * Exports types, demo data generators, and pure transformation functions
 * used by useIntoto and useIntotoFetch.
 */

import { MS_PER_HOUR, MS_PER_MINUTE } from '../lib/constants/time'

// ── Types ────────────────────────────────────────────────────────────────

export interface IntotoStep {
  name: string
  status: 'verified' | 'failed' | 'missing' | 'unknown'
  functionary: string
  linksFound: number
}

export interface IntotoLayout {
  name: string
  cluster: string
  namespace?: string
  steps: IntotoStep[]
  expectedProducts: number
  verifiedSteps: number
  failedSteps: number
  createdAt: string
}

export interface IntotoClusterStatus {
  cluster: string
  installed: boolean
  loading: boolean
  error?: string
  layouts: IntotoLayout[]
  totalLayouts: number
  totalSteps: number
  verifiedSteps: number
  failedSteps: number
  missingSteps: number
}

export interface IntotoStats {
  totalLayouts: number
  totalSteps: number
  verifiedSteps: number
  failedSteps: number
  missingSteps: number
}

// ── Kubernetes resource types ────────────────────────────────────────────

export interface IntotoLayoutResource {
  metadata: {
    name: string
    namespace?: string
    creationTimestamp?: string
  }
  spec: {
    steps?: Array<{
      name: string
      pubkeys?: string[]
      expectedMaterials?: unknown[]
      expectedProducts?: unknown[]
    }>
    inspect?: unknown[]
    keys?: Record<string, unknown>
  }
}

export interface IntotoLinkResource {
  metadata: {
    name: string
    namespace?: string
    labels?: Record<string, string>
  }
  spec: {
    name?: string
    command?: string[]
    materials?: Record<string, unknown>
    products?: Record<string, unknown>
  }
  status?: {
    verified?: boolean
  }
}

// ── Pure transformation functions ────────────────────────────────────────

/**
 * Pure function to compute aggregate statistics for in-toto layouts.
 * Used for both per-cluster status and global component-level statistics.
 */
export function computeIntotoStats(layouts: IntotoLayout[]): IntotoStats {
  const stats = {
    totalLayouts: layouts.length,
    totalSteps: 0,
    verifiedSteps: 0,
    failedSteps: 0,
    missingSteps: 0,
  }

  for (const layout of (layouts || [])) {
    stats.totalSteps += layout.steps.length
    stats.verifiedSteps += layout.verifiedSteps
    stats.failedSteps += layout.failedSteps
  }

  stats.missingSteps = stats.totalSteps - stats.verifiedSteps - stats.failedSteps
  return stats
}

/**
 * Safely parse JSON with fallback and logging.
 */
export function safeJsonParse<T>(raw: string, fallback: T, context: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn(`[useIntoto] Failed to parse ${context}, using default`, err)
    return fallback
  }
}

/**
 * Create an empty cluster status (for errors or not-installed clusters).
 */
export function emptyStatus(cluster: string, installed: boolean, error?: string): IntotoClusterStatus {
  return {
    cluster, installed, loading: false, error,
    layouts: [], totalLayouts: 0, totalSteps: 0,
    verifiedSteps: 0, failedSteps: 0, missingSteps: 0,
  }
}

// ── Demo data generators ─────────────────────────────────────────────────

function getDemoLayouts(cluster: string): IntotoLayout[] {
  return [
    {
      name: 'build-and-push',
      cluster,
      steps: [
        { name: 'clone-repo', status: 'verified', functionary: 'ci-bot', linksFound: 1 },
        { name: 'run-tests', status: 'verified', functionary: 'ci-bot', linksFound: 1 },
        { name: 'build-image', status: 'verified', functionary: 'ci-bot', linksFound: 1 },
        { name: 'push-image', status: 'verified', functionary: 'registry-bot', linksFound: 1 },
      ],
      expectedProducts: 4,
      verifiedSteps: 4,
      failedSteps: 0,
      createdAt: new Date(Date.now() - 2 * MS_PER_HOUR).toISOString(),
    },
    {
      name: 'deploy-pipeline',
      cluster,
      steps: [
        { name: 'pull-image', status: 'verified', functionary: 'deploy-bot', linksFound: 1 },
        { name: 'scan-image', status: 'failed', functionary: 'scanner-bot', linksFound: 0 },
        { name: 'apply-manifests', status: 'missing', functionary: 'deploy-bot', linksFound: 0 },
      ],
      expectedProducts: 3,
      verifiedSteps: 1,
      failedSteps: 2,
      createdAt: new Date(Date.now() - 1 * MS_PER_HOUR).toISOString(),
    },
    {
      name: 'release-signing',
      cluster,
      steps: [
        { name: 'sign-artifact', status: 'verified', functionary: 'release-bot', linksFound: 1 },
        { name: 'upload-provenance', status: 'verified', functionary: 'release-bot', linksFound: 1 },
      ],
      expectedProducts: 2,
      verifiedSteps: 2,
      failedSteps: 0,
      createdAt: new Date(Date.now() - 30 * MS_PER_MINUTE).toISOString(),
    },
  ]
}

export function getDemoStatus(cluster: string): IntotoClusterStatus {
  const layouts = getDemoLayouts(cluster)
  const stats = computeIntotoStats(layouts)
  return {
    cluster,
    installed: true,
    loading: false,
    layouts,
    ...stats,
  }
}
