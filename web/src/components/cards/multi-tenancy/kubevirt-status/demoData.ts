/**
 * Demo data for the KubeVirt status card.
 *
 * Represents a healthy KubeVirt deployment with the operator infrastructure
 * running, and 6 VMs (4 running, 1 stopped, 1 migrating) distributed across
 * 3 tenants. Used when the dashboard is in demo mode or no clusters are connected.
 */

import type { ComponentHealth } from '../shared'
import type { VmState } from './helpers'

/** Individual VM info shown in the card detail list */
export interface VmInfo {
  /** VM name (from virt-launcher pod name) */
  name: string
  /** Tenant namespace */
  namespace: string
  /** Current VM state */
  state: VmState
}

export interface KubevirtStatusDemoData {
  detected: boolean
  health: ComponentHealth
  podCount: number
  healthyPods: number
  unhealthyPods: number
  vms: VmInfo[]
  tenantCount: number
  lastCheckTime: string
}

/** Demo: timestamp offset for latest refresh (2 minutes ago) */
const DEMO_LAST_CHECK_AGO_MS = 2 * 60 * 1000

/** Demo: total KubeVirt infrastructure pods (operator + controller + api + handler + handler) */
const DEMO_POD_COUNT = 5

/** Demo: all infrastructure pods healthy */
const DEMO_HEALTHY_PODS = 5

/** Demo: no unhealthy infrastructure pods */
const DEMO_UNHEALTHY_PODS = 0

/** Demo: number of tenants with VMs */
const DEMO_TENANT_COUNT = 3

export const KUBEVIRT_DEMO_DATA: KubevirtStatusDemoData = {
  detected: true,
  health: 'healthy',
  podCount: DEMO_POD_COUNT,
  healthyPods: DEMO_HEALTHY_PODS,
  unhealthyPods: DEMO_UNHEALTHY_PODS,
  vms: [
    { name: 'web-server-01', namespace: 'tenant-alpha', state: 'running' },
    { name: 'web-server-02', namespace: 'tenant-alpha', state: 'running' },
    { name: 'db-primary', namespace: 'tenant-beta', state: 'running' },
    { name: 'db-replica', namespace: 'tenant-beta', state: 'migrating' },
    { name: 'app-server', namespace: 'tenant-gamma', state: 'running' },
    { name: 'batch-worker', namespace: 'tenant-gamma', state: 'stopped' },
  ],
  tenantCount: DEMO_TENANT_COUNT,
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_AGO_MS).toISOString(),
}
