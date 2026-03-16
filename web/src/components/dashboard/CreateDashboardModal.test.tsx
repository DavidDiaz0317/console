import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import * as CreateDashboardModalModule from './CreateDashboardModal'

vi.mock('../../hooks/useDashboardHealth', () => ({
  useDashboardHealth: () => ({
    status: 'warning',
    message: '1 cluster degraded',
    details: ['1 cluster degraded'],
    criticalCount: 0,
    warningCount: 1,
    navigateTo: '/alerts',
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../lib/modals', () => {
  const Header = () => null
  const Content = ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children)
  const Footer = () => null
  const BM = ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? React.createElement('div', { 'data-testid': 'modal' }, children) : null
  BM.Header = Header
  BM.Content = Content
  BM.Footer = Footer
  return { BaseModal: BM }
})

vi.mock('./templates', () => ({
  DASHBOARD_TEMPLATES: [],
  TEMPLATE_CATEGORIES: [],
}))

vi.mock('../../lib/constants/network', () => ({
  FOCUS_DELAY_MS: 0,
}))

describe('CreateDashboardModal Component', () => {
  it('exports CreateDashboardModal component', () => {
    expect(CreateDashboardModalModule.CreateDashboardModal).toBeDefined()
    expect(typeof CreateDashboardModalModule.CreateDashboardModal).toBe('function')
  })

  it('shows health status indicator when modal is open', () => {
    render(
      <CreateDashboardModalModule.CreateDashboardModal
        isOpen={true}
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />
    )
    expect(screen.getByText('1 cluster degraded')).toBeInTheDocument()
  })

  it('does not render health indicator when modal is closed', () => {
    render(
      <CreateDashboardModalModule.CreateDashboardModal
        isOpen={false}
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />
    )
    expect(screen.queryByText('1 cluster degraded')).not.toBeInTheDocument()
  })
})
