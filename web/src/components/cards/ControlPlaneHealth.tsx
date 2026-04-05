import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCachedPods } from '../../hooks/useCachedData'
import { useClusters } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'

const CP_LABELS: Record<string, string[]> = {
  'API Server': ['component=kube-apiserver', 'app=openshift-kube-apiserver'],
  'Scheduler': ['component=kube-scheduler', 'app=openshift-kube-scheduler'],
  'Controller Mgr': ['component=kube-controller-manager', 'app=openshift-kube-controller-manager'],
  'etcd': ['component=etcd', 'app=etcd'],
  'CoreDNS': ['k8s-app=kube-dns'],
}

// Namespaces that may host control-plane pods.
// kube-system covers vanilla Kubernetes; the openshift-* namespaces cover
// OpenShift clusters where each component lives in its own isolated namespace.
const CP_NAMESPACES = [
  'kube-system',
  'openshift-kube-apiserver',
  'openshift-kube-controller-manager',
  'openshift-kube-scheduler',
  'openshift-etcd',
] as const

export function ControlPlaneHealth() {
  const { t } = useTranslation('cards')

  // Fetch from every control-plane namespace and merge the results.
  // Using individual hook calls (one per namespace) satisfies React's
  // rules-of-hooks requirement that hooks cannot be called inside loops.
  const kubeSystem = useCachedPods(undefined, CP_NAMESPACES[0])
  const osApiServer = useCachedPods(undefined, CP_NAMESPACES[1])
  const osCtrlMgr = useCachedPods(undefined, CP_NAMESPACES[2])
  const osScheduler = useCachedPods(undefined, CP_NAMESPACES[3])
  const osEtcd = useCachedPods(undefined, CP_NAMESPACES[4])

  const allResults = [kubeSystem, osApiServer, osCtrlMgr, osScheduler, osEtcd]

  // Merge pod lists, deduplicating by (cluster, namespace, name).
  // Tracking the .pods arrays is sufficient: each hook returns a new array
  // reference whenever its data changes, so this memo will re-run exactly
  // when any namespace's pod list is updated.
  const pods = useMemo(() => {
    const seen = new Set<string>()
    return allResults.flatMap(r => r.pods).filter(p => {
      const key = `${p.cluster}/${p.namespace}/${p.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [kubeSystem.pods, osApiServer.pods, osCtrlMgr.pods, osScheduler.pods, osEtcd.pods])

  const isLoading = allResults.some(r => r.isLoading)
  const isRefreshing = allResults.some(r => r.isRefreshing)
  // Demo mode is a global flag — all hooks agree, so any one is representative.
  const isDemoFallback = kubeSystem.isDemoFallback
  // Only consider the card truly failed when every namespace fetch has failed.
  const isFailed = allResults.every(r => r.isFailed)
  const consecutiveFailures = Math.max(...allResults.map(r => r.consecutiveFailures))
  const { clusters } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)

  const hasData = pods.length > 0
  const { showSkeleton } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })

  const clusterNames = useMemo(() => {
    const names = new Set(pods.map(p => p.cluster).filter(Boolean))
    return Array.from(names).sort()
  }, [pods])

  const filtered = selectedCluster ? pods.filter(p => p.cluster === selectedCluster) : pods

  const componentStatus = useMemo(() => {
    return Object.entries(CP_LABELS).map(([name, labels]) => {
      const matching = filtered.filter(pod => {
        const podLabels = pod.labels
        if (!podLabels) {
          return labels.some(l => {
            const [, val] = l.split('=')
            return pod.name?.includes(val)
          })
        }
        return labels.some(l => {
          const [key, val] = l.split('=')
          return podLabels[key] === val
        })
      })
      const ready = matching.filter(p => p.status === 'Running')
      const totalRestarts = matching.reduce((sum, p) => sum + (p.restarts || 0), 0)
      return { name, total: matching.length, ready: ready.length, restarts: totalRestarts }
    })
  }, [filtered])

  // Only declare "managed cluster" when data has fully and successfully loaded
  // (not loading, not failed, not demo) and no control-plane pods were found.
  // Without the !isFailed guard, a cluster that exhausted its retry budget
  // (MAX_FAILURES) would show the cloud-provider UI instead of an error state,
  // because isLoading drops to false after retries are exhausted while isFailed
  // becomes true.
  const managedCluster = componentStatus.every(c => c.total === 0)
    && clusters.length > 0
    && !isLoading
    && !isFailed
    && !isDemoFallback

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} variant="rounded" height={32} />
        ))}
      </div>
    )
  }

  if (managedCluster) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
        <div className="text-2xl mb-2">☁️</div>
        <div className="font-medium">{t('controlPlaneHealth.managedCluster')}</div>
        <div className="text-xs text-center mt-1">{t('controlPlaneHealth.managedClusterDescription')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      {clusterNames.length > 1 && (
        <div className="flex gap-1 flex-wrap mb-2">
          <button
            onClick={() => setSelectedCluster(null)}
            className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
              !selectedCluster ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-muted-foreground'
            }`}
          >
            {t('controlPlaneHealth.all')}
          </button>
          {clusterNames.map(name => (
            <button
              key={name}
              onClick={() => setSelectedCluster(name ?? null)}
              className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                selectedCluster === name ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-muted-foreground'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {componentStatus.map(comp => (
        <div key={comp.name} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              comp.total === 0 ? 'bg-muted-foreground/30' :
              comp.ready === comp.total ? 'bg-green-500' :
              comp.ready > 0 ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            <span className="text-sm font-medium">{comp.name}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{comp.ready}/{comp.total}</span>
            {comp.restarts > 0 && (
              <span className="text-orange-400">{t('controlPlaneHealth.restarts', { count: comp.restarts })}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
