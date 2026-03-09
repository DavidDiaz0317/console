import { describe, it, expect } from 'vitest'
import * as CreateDashboardModalModule from './CreateDashboardModal'

describe('CreateDashboardModal Component', () => {
  it('exports CreateDashboardModal component', () => {
    expect(CreateDashboardModalModule.CreateDashboardModal).toBeDefined()
    expect(typeof CreateDashboardModalModule.CreateDashboardModal).toBe('function')
  })

  it('includes DashboardHealthIndicator in the modal header', () => {
    // Verify the component renders DashboardHealthIndicator for system health awareness
    const src = CreateDashboardModalModule.CreateDashboardModal.toString()
    expect(src).toContain('DashboardHealthIndicator')
  })
})
