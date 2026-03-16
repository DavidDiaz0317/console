/**
 * Demo data for the Tenant Isolation Setup card.
 *
 * All components ready, 3/3 isolation levels active.
 */
import type { TenantIsolationSetupData } from './useTenantIsolationSetup'

/** Number of total components in the multi-tenancy stack */
const DEMO_COMPONENT_COUNT = 4
/** Number of isolation levels in demo mode */
const DEMO_ISOLATION_SCORE = 3
/** Total isolation levels */
const DEMO_TOTAL_LEVELS = 3

export const DEMO_TENANT_ISOLATION_SETUP: TenantIsolationSetupData = {
  components: [
    { name: 'OVN-Kubernetes', key: 'ovn', detected: true, health: 'healthy' },
    { name: 'KubeFlex', key: 'kubeflex', detected: true, health: 'healthy' },
    { name: 'K3s', key: 'k3s', detected: true, health: 'healthy' },
    { name: 'KubeVirt', key: 'kubevirt', detected: true, health: 'healthy' },
  ],
  isolationLevels: [
    { type: 'Control-plane', status: 'ready', provider: 'KubeFlex + K3s' },
    { type: 'Data-plane', status: 'ready', provider: 'KubeVirt' },
    { type: 'Network', status: 'ready', provider: 'OVN-Kubernetes' },
  ],
  allReady: true,
  readyCount: DEMO_COMPONENT_COUNT,
  totalComponents: DEMO_COMPONENT_COUNT,
  isolationScore: DEMO_ISOLATION_SCORE,
  totalIsolationLevels: DEMO_TOTAL_LEVELS,
  isLoading: false,
  isDemoData: true,
}
