import { describe, it, expect } from 'vitest'
import {
  analyzeRootCause,
  buildOfflineItems,
  buildGpuItems,
  buildPredictionItems,
  generatePredictionId,
  type NodeData,
  type GpuIssue,
} from '../offlineDataTransforms'
import type { PredictedRisk } from '../../../../types/predictions'

describe('offlineDataTransforms', () => {
  describe('analyzeRootCause', () => {
    it('returns null when no conditions exist', () => {
      const node: NodeData = {
        name: 'node-1',
        cluster: 'cluster-a',
        status: 'Ready',
        roles: ['worker'],
        conditions: [],
      }
      expect(analyzeRootCause(node)).toBeNull()
    })

    it('detects memory pressure', () => {
      const node: NodeData = {
        name: 'node-1',
        cluster: 'cluster-a',
        status: 'NotReady',
        roles: ['worker'],
        conditions: [
          {
            type: 'MemoryPressure',
            status: 'True',
            message: 'Node has memory pressure',
          },
        ],
      }
      const result = analyzeRootCause(node)
      expect(result?.cause).toContain('Memory pressure')
      expect(result?.details).toContain('memory')
    })

    it('detects disk pressure', () => {
      const node: NodeData = {
        name: 'node-1',
        cluster: 'cluster-a',
        status: 'NotReady',
        roles: ['worker'],
        conditions: [
          {
            type: 'DiskPressure',
            status: 'True',
            message: 'Node disk is full',
          },
        ],
      }
      const result = analyzeRootCause(node)
      expect(result?.cause).toContain('Disk pressure')
      expect(result?.details).toContain('disk')
    })

    it('detects PID pressure', () => {
      const node: NodeData = {
        name: 'node-1',
        cluster: 'cluster-a',
        status: 'NotReady',
        roles: ['worker'],
        conditions: [
          {
            type: 'PIDPressure',
            status: 'True',
            message: 'Node PID pressure',
          },
        ],
      }
      const result = analyzeRootCause(node)
      expect(result?.cause).toContain('PID pressure')
    })

    it('detects network unavailability', () => {
      const node: NodeData = {
        name: 'node-1',
        cluster: 'cluster-a',
        status: 'NotReady',
        roles: ['worker'],
        conditions: [
          {
            type: 'NetworkUnavailable',
            status: 'True',
            message: 'Network not configured',
          },
        ],
      }
      const result = analyzeRootCause(node)
      expect(result?.cause).toContain('Network unavailable')
    })

    it('detects Kubelet issues', () => {
      const node: NodeData = {
        name: 'node-1',
        cluster: 'cluster-a',
        status: 'NotReady',
        roles: ['worker'],
        conditions: [
          {
            type: 'Ready',
            status: 'False',
            reason: 'KubeletDown',
            message: 'Kubelet not responding',
          },
        ],
      }
      const result = analyzeRootCause(node)
      expect(result?.cause).toContain('Kubelet')
    })

    it('detects cordoned nodes (unschedulable)', () => {
      const node: NodeData = {
        name: 'node-1',
        cluster: 'cluster-a',
        status: 'Ready',
        roles: ['worker'],
        unschedulable: true,
        conditions: [],
      }
      const result = analyzeRootCause(node)
      expect(result?.cause).toContain('Cordoned')
      expect(result?.details).toContain('maintenance')
    })

    it('prioritizes memory pressure over other issues', () => {
      const node: NodeData = {
        name: 'node-1',
        cluster: 'cluster-a',
        status: 'NotReady',
        roles: ['worker'],
        conditions: [
          { type: 'MemoryPressure', status: 'True', message: 'Memory low' },
          { type: 'DiskPressure', status: 'True', message: 'Disk low' },
        ],
      }
      const result = analyzeRootCause(node)
      expect(result?.cause).toBe('Memory pressure')
    })

    it('returns multiple problems when memory not present', () => {
      const node: NodeData = {
        name: 'node-1',
        cluster: 'cluster-a',
        status: 'NotReady',
        roles: ['worker'],
        conditions: [
          { type: 'DiskPressure', status: 'True', message: 'Disk low' },
          { type: 'PIDPressure', status: 'True', message: 'PID low' },
        ],
      }
      const result = analyzeRootCause(node)
      expect(result?.cause).toContain('Disk pressure')
    })

    it('ignores conditions with False status', () => {
      const node: NodeData = {
        name: 'node-1',
        cluster: 'cluster-a',
        status: 'Ready',
        roles: ['worker'],
        conditions: [
          { type: 'MemoryPressure', status: 'False' },
          { type: 'DiskPressure', status: 'False' },
        ],
      }
      const result = analyzeRootCause(node)
      expect(result).toBeNull()
    })
  })

  describe('buildOfflineItems', () => {
    it('creates unified items from offline nodes', () => {
      const nodes: NodeData[] = [
        {
          name: 'node-1',
          cluster: 'cluster-a',
          status: 'NotReady',
          roles: ['worker'],
        },
      ]
      const items = buildOfflineItems(nodes)
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
        category: 'offline',
        name: 'node-1',
        cluster: 'cluster-a',
        severity: 'critical',
      })
    })

    it('generates unique IDs for offline items', () => {
      const nodes: NodeData[] = [
        {
          name: 'node-1',
          cluster: 'cluster-a',
          status: 'NotReady',
          roles: ['worker'],
        },
        {
          name: 'node-2',
          cluster: 'cluster-a',
          status: 'NotReady',
          roles: ['worker'],
        },
      ]
      const items = buildOfflineItems(nodes)
      expect(items[0].id).not.toBe(items[1].id)
      expect(items[0].id).toMatch(/offline-/)
    })

    it('includes root cause analysis in offline items', () => {
      const nodes: NodeData[] = [
        {
          name: 'node-1',
          cluster: 'cluster-a',
          status: 'NotReady',
          roles: ['worker'],
          conditions: [
            { type: 'MemoryPressure', status: 'True', message: 'Memory low' },
          ],
        },
      ]
      const items = buildOfflineItems(nodes)
      expect(items[0].rootCause).toBeDefined()
      expect(items[0].rootCause?.cause).toContain('Memory')
    })

    it('includes node data reference in unified items', () => {
      const nodes: NodeData[] = [
        {
          name: 'node-1',
          cluster: 'cluster-a',
          status: 'NotReady',
          roles: ['worker'],
        },
      ]
      const items = buildOfflineItems(nodes)
      expect(items[0].nodeData).toEqual(nodes[0])
    })

    it('handles empty offline nodes array', () => {
      const items = buildOfflineItems([])
      expect(items).toEqual([])
    })
  })

  describe('buildGpuItems', () => {
    it('creates unified items from GPU issues', () => {
      const issues: GpuIssue[] = [
        {
          cluster: 'cluster-a',
          nodeName: 'gpu-node-1',
          expected: 4,
          available: 2,
          reason: 'GPU reset required',
        },
      ]
      const items = buildGpuItems(issues)
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
        category: 'gpu',
        name: 'gpu-node-1',
        cluster: 'cluster-a',
        severity: 'warning',
      })
    })

    it('generates unique IDs for GPU items', () => {
      const issues: GpuIssue[] = [
        {
          cluster: 'cluster-a',
          nodeName: 'node-1',
          expected: 4,
          available: 2,
          reason: 'GPU reset required',
        },
        {
          cluster: 'cluster-b',
          nodeName: 'node-1',
          expected: 4,
          available: 0,
          reason: 'GPU offline',
        },
      ]
      const items = buildGpuItems(issues)
      expect(items[0].id).not.toBe(items[1].id)
      expect(items[0].id).toMatch(/gpu-/)
    })

    it('includes GPU data reference', () => {
      const issues: GpuIssue[] = [
        {
          cluster: 'cluster-a',
          nodeName: 'gpu-node-1',
          expected: 4,
          available: 2,
          reason: 'GPU reset required',
        },
      ]
      const items = buildGpuItems(issues)
      expect(items[0].gpuData).toEqual(issues[0])
    })

    it('handles empty GPU issues array', () => {
      const items = buildGpuItems([])
      expect(items).toEqual([])
    })
  })

  describe('buildPredictionItems', () => {
    it('creates unified items from predicted risks', () => {
      const risks: PredictedRisk[] = [
        {
          id: 'pred-1',
          name: 'high-latency',
          cluster: 'cluster-a',
          severity: 'warning',
          reason: 'High latency detected',
          trend: 'worsening',
        },
      ]
      const items = buildPredictionItems(risks)
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
        category: 'prediction',
        name: 'high-latency',
        cluster: 'cluster-a',
        severity: 'warning',
      })
    })

    it('preserves prediction ID', () => {
      const risks: PredictedRisk[] = [
        {
          id: 'pred-unique-123',
          name: 'high-latency',
          cluster: 'cluster-a',
          severity: 'warning',
          reason: 'High latency',
          trend: 'worsening',
        },
      ]
      const items = buildPredictionItems(risks)
      expect(items[0].id).toBe('pred-unique-123')
    })

    it('includes prediction data reference', () => {
      const risks: PredictedRisk[] = [
        {
          id: 'pred-1',
          name: 'high-latency',
          cluster: 'cluster-a',
          severity: 'warning',
          reason: 'High latency',
          trend: 'improving',
        },
      ]
      const items = buildPredictionItems(risks)
      expect(items[0].predictionData).toEqual(risks[0])
    })

    it('handles different severity levels', () => {
      const risks: PredictedRisk[] = [
        {
          id: 'pred-1',
          name: 'risk-1',
          cluster: 'cluster-a',
          severity: 'critical',
          reason: 'Critical risk',
        },
        {
          id: 'pred-2',
          name: 'risk-2',
          cluster: 'cluster-a',
          severity: 'warning',
          reason: 'Warning risk',
        },
        {
          id: 'pred-3',
          name: 'risk-3',
          cluster: 'cluster-a',
          severity: 'info',
          reason: 'Info risk',
        },
      ]
      const items = buildPredictionItems(risks)
      expect(items[0].severity).toBe('critical')
      expect(items[1].severity).toBe('warning')
      expect(items[2].severity).toBe('info')
    })

    it('handles empty predictions array', () => {
      const items = buildPredictionItems([])
      expect(items).toEqual([])
    })
  })

  describe('generatePredictionId', () => {
    it('generates unique prediction IDs', () => {
      const id1 = generatePredictionId('latency', 'service-1', 'cluster-a')
      const id2 = generatePredictionId('latency', 'service-2', 'cluster-a')
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^heuristic-/)
    })

    it('generates ID without cluster when cluster is undefined', () => {
      const id = generatePredictionId('latency', 'service-1')
      expect(id).toContain('unknown')
      expect(id).toMatch(/^heuristic-/)
    })

    it('includes all parameters in ID', () => {
      const id = generatePredictionId('cpu-pressure', 'node-5', 'cluster-prod')
      expect(id).toContain('cpu-pressure')
      expect(id).toContain('node-5')
      expect(id).toContain('cluster-prod')
    })

    it('generates consistent IDs for same inputs', () => {
      const id1 = generatePredictionId('latency', 'svc', 'cluster-a')
      const id2 = generatePredictionId('latency', 'svc', 'cluster-a')
      expect(id1).toBe(id2)
    })

    it('differentiates IDs by type', () => {
      const id1 = generatePredictionId('latency', 'svc', 'cluster-a')
      const id2 = generatePredictionId('cpu', 'svc', 'cluster-a')
      expect(id1).not.toBe(id2)
    })

    it('differentiates IDs by name', () => {
      const id1 = generatePredictionId('latency', 'svc-1', 'cluster-a')
      const id2 = generatePredictionId('latency', 'svc-2', 'cluster-a')
      expect(id1).not.toBe(id2)
    })

    it('differentiates IDs by cluster', () => {
      const id1 = generatePredictionId('latency', 'svc', 'cluster-a')
      const id2 = generatePredictionId('latency', 'svc', 'cluster-b')
      expect(id1).not.toBe(id2)
    })
  })
})
