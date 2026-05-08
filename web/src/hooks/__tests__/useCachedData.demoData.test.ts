import { describe, it, expect } from 'vitest'
import { getDemoPods } from '../useCachedData/demoData'

describe('getDemoPods', () => {
  it('includes healthy etcd demo pods across multiple clusters', () => {
    const etcdPods = getDemoPods().filter(pod => pod.name.includes('etcd'))

    expect(etcdPods.length).toBeGreaterThanOrEqual(6)
    expect(new Set(etcdPods.map(pod => pod.cluster)).size).toBeGreaterThanOrEqual(3)

    for (const pod of etcdPods) {
      expect(pod.namespace).toBe('kube-system')
      expect(pod.status).toBe('Running')
      expect(pod.labels?.component).toBe('etcd')
      expect(pod.containers?.[0]?.name).toBe('etcd')
    }
  })
})
