/**
 * useClusterStats Hook Tests
 */
import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import * as mod from '../useClusterStats'
import type { ClusterInfo } from '../../../hooks/mcp/types'

describe('useClusterStats', () => {
  it('exports useClusterStats hook', () => {
    expect(mod.useClusterStats).toBeDefined()
    expect(typeof mod.useClusterStats).toBe('function')
  })

  it('aggregates ready nodes and pod phase counts from cluster health data', () => {
    const clusters = [
      {
        name: 'oci-oke-live',
        context: 'oci-oke-live',
        healthy: true,
        reachable: true,
        nodeCount: 3,
        readyNodes: 3,
        podCount: 8,
        runningPods: 6,
        pendingPods: 1,
        crashLoopBackOffPods: 1,
      },
    ] satisfies ClusterInfo[]

    const { result } = renderHook(() => mod.useClusterStats({
      globalFilteredClusters: clusters,
      gpuByCluster: {},
    }))

    expect(result.current.totalNodes).toBe(3)
    expect(result.current.healthyNodes).toBe(3)
    expect(result.current.totalPods).toBe(8)
    expect(result.current.runningPods).toBe(6)
    expect(result.current.pendingPods).toBe(1)
    expect(result.current.crashLoopBackOffPods).toBe(1)
  })
})
