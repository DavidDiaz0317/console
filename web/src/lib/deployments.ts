import type { Deployment, DeploymentIssue } from '../hooks/useMCP'

export function isDeploymentHealthy(deployment: Deployment): boolean {
  return deployment.status === 'running'
    || ((deployment.readyReplicas ?? 0) === (deployment.replicas ?? 0) && (deployment.replicas ?? 0) > 0)
}

export function isDeploymentIssue(deployment: Deployment): boolean {
  return (deployment.readyReplicas ?? 0) < (deployment.replicas ?? 1)
}

export function deriveDeploymentIssues(deployments: Deployment[]): DeploymentIssue[] {
  return (deployments || [])
    .filter(isDeploymentIssue)
    .map((deployment) => ({
      name: deployment.name,
      namespace: deployment.namespace || 'default',
      cluster: deployment.cluster,
      replicas: deployment.replicas ?? 1,
      readyReplicas: deployment.readyReplicas ?? 0,
      reason: deployment.status === 'failed' ? 'DeploymentFailed' : 'ReplicaFailure',
      message: deployment.message || '',
    }))
}

export function summarizeDeployments(deployments: Deployment[]) {
  const safeDeployments = deployments || []
  const issues = deriveDeploymentIssues(safeDeployments)

  return {
    total: safeDeployments.length,
    healthyCount: safeDeployments.filter(isDeploymentHealthy).length,
    progressingCount: safeDeployments.filter((deployment) => deployment.status === 'deploying').length,
    failedCount: safeDeployments.filter((deployment) => deployment.status === 'failed').length,
    issueCount: issues.length,
    issues,
  }
}
