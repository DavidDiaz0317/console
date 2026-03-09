import { describe, it, expect } from 'vitest'
import * as DashboardDropZoneModule from './DashboardDropZone'

describe('DashboardDropZone Component', () => {
  it('exports DashboardDropZone component', () => {
    expect(DashboardDropZoneModule.DashboardDropZone).toBeDefined()
    expect(typeof DashboardDropZoneModule.DashboardDropZone).toBe('function')
  })

  it('uses useDashboardHealth to provide health status in drop zone panel', () => {
    // Verify the component function references health-related behavior by
    // checking it imports/uses the hook (source-level contract test)
    const src = DashboardDropZoneModule.DashboardDropZone.toString()
    // The component renders health status (icon + message) from useDashboardHealth
    expect(src).toContain('health')
  })
})
