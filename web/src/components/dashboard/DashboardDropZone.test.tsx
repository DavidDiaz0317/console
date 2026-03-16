import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as DashboardDropZoneModule from './DashboardDropZone'

vi.mock('../../hooks/useDashboardHealth', () => ({
  useDashboardHealth: () => ({
    status: 'critical',
    message: '2 clusters offline',
    details: ['2 clusters offline'],
    criticalCount: 2,
    warningCount: 0,
    navigateTo: '/alerts',
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('DashboardDropZone Component', () => {
  it('exports DashboardDropZone component', () => {
    expect(DashboardDropZoneModule.DashboardDropZone).toBeDefined()
    expect(typeof DashboardDropZoneModule.DashboardDropZone).toBe('function')
  })

  it('shows cluster health status indicator when dragging', () => {
    render(
      <DashboardDropZoneModule.DashboardDropZone
        dashboards={[]}
        currentDashboardId="current"
        isDragging={true}
        onCreateDashboard={vi.fn()}
      />
    )
    expect(screen.getByText('2 clusters offline')).toBeInTheDocument()
  })

  it('does not render when not dragging', () => {
    const { container } = render(
      <DashboardDropZoneModule.DashboardDropZone
        dashboards={[]}
        currentDashboardId="current"
        isDragging={false}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
