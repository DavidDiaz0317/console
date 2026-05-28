import { describe, expect, it } from 'vitest'
import type { Deployment } from '../hooks/useMCP'
import { deriveDeploymentIssues, summarizeDeployments } from './deployments'

describe('deployment helpers', () => {
  it('derives issue counts and stats from the same deployments', () => {
    const deployments: Deployment[] = [
      {
        name: 'healthy-app',
        namespace: 'default',
        cluster: 'prod',
        status: 'running',
        replicas: 1,
        readyReplicas: 1,
        updatedReplicas: 1,
        availableReplicas: 1,
        progress: 100,
      },
      {
        name: 'stuck-app',
        namespace: 'default',
        cluster: 'prod',
        status: 'deploying',
        replicas: 2,
        readyReplicas: 1,
        updatedReplicas: 1,
        availableReplicas: 1,
        progress: 50,
      },
      {
        name: 'failed-app',
        namespace: 'default',
        cluster: 'prod',
        status: 'failed',
        replicas: 1,
        readyReplicas: 0,
        updatedReplicas: 0,
        availableReplicas: 0,
        progress: 0,
        message: 'CrashLoopBackOff',
      },
    ]

    const issues = deriveDeploymentIssues(deployments)
    const summary = summarizeDeployments(deployments)

    expect(issues).toHaveLength(2)
    expect(summary.issueCount).toBe(issues.length)
    expect(summary.healthyCount).toBe(1)
    expect(summary.progressingCount).toBe(1)
    expect(summary.failedCount).toBe(1)
  })
})
