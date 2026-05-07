import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SidebarShell, type NavSection } from '../SidebarShell'
import { alertsDashboardConfig } from '../../../config/dashboards/alerts'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { count?: number }) => options?.count ?? key }),
}))

vi.mock('../../../hooks/useSidebarConfig', () => ({
  useSidebarConfig: () => ({
    config: { collapsed: false, items: [], width: 240 },
    toggleCollapsed: vi.fn(),
    setCollapsed: vi.fn(),
    reorderItems: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    closeMobileSidebar: vi.fn(),
    setWidth: vi.fn(),
  }),
  PROTECTED_SIDEBAR_IDS: [],
  SIDEBAR_COLLAPSED_WIDTH_PX: 64,
  SIDEBAR_DEFAULT_WIDTH_PX: 240,
}))

vi.mock('../../../hooks/useMobile', () => ({
  useMobile: () => ({ isMobile: false }),
}))

vi.mock('../../../hooks/mcp/clusters', () => ({
  useClusters: () => ({ deduplicatedClusters: [] }),
}))

vi.mock('../../../hooks/useDashboardContext', () => ({
  useDashboardContextOptional: () => null,
}))

vi.mock('../../../hooks/useActiveUsers', () => ({
  useActiveUsers: () => ({ viewerCount: 0, hasError: false, isLoading: false }),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ isFullScreen: false }),
}))

vi.mock('../../../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({ hasUpdate: false, channel: 'stable', latestMainSHA: '' }),
}))

vi.mock('../../../hooks/useUpgradeState', () => ({
  useUpgradeState: () => ({ phase: 'idle' }),
}))

const navSections: NavSection[] = [{
  id: 'primary',
  items: [{ id: 'alerts', label: 'Alerts', href: '/alerts', icon: 'Bell' }],
}]

describe('SidebarShell', () => {
  it('shows the alerts dashboard card count in the sidebar', () => {
    render(
      <MemoryRouter initialEntries={['/alerts']}>
        <SidebarShell navSections={navSections} />
      </MemoryRouter>
    )

    const alertsLink = screen.getByRole('link', { name: /Alerts/i })
    expect(within(alertsLink).getByText(String(alertsDashboardConfig.cards.length))).toBeInTheDocument()
  })
})
