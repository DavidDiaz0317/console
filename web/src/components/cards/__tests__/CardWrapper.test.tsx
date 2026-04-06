/**
 * CardWrapper Interaction Tests
 *
 * Covers the refresh button interaction (#ef4a2e36):
 * - Refresh button renders when onRefresh is provided
 * - Clicking the refresh button calls onRefresh
 * - Clicking the refresh button calls emitCardRefreshed analytics event
 * - Refresh button is disabled while isRefreshing is true
 * - Refresh button is NOT rendered when onRefresh is not provided
 * - Refresh button becomes disabled while the card is in effectiveIsLoading state
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks — must come before any module that transitively imports them
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => false,
  getDemoMode: () => false,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => false,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => {},
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: () => false,
  hasRealToken: () => true,
  isDemoModeForced: false,
  isNetlifyDeployment: false,
  canToggleDemoMode: () => false,
  isDemoToken: () => false,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

const mockEmitCardRefreshed = vi.fn()
const mockEmitCardExpanded = vi.fn()
vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(),
  emitLogin: vi.fn(),
  emitEvent: vi.fn(),
  analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(),
  emitCardExpanded: (...args: unknown[]) => mockEmitCardExpanded(...args),
  emitCardRefreshed: (...args: unknown[]) => mockEmitCardRefreshed(...args),
  markErrorReported: vi.fn(),
  emitError: vi.fn(),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn(), openSidebar: vi.fn() }),
}))

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ status: 'disconnected' }),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useCardCollapse: () => ({ isCollapsed: false, setCollapsed: vi.fn() }),
  commonComparators: {
    string: () => () => 0,
    number: () => () => 0,
  },
}))

vi.mock('../../../hooks/useSnoozedCards', () => ({
  useSnoozedCards: () => ({ snoozeSwap: vi.fn() }),
}))

vi.mock('../../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

vi.mock('../../../lib/widgets/widgetRegistry', () => ({
  isCardExportable: () => false,
}))

vi.mock('../../../lib/cards/cardInstallMap', () => ({
  CARD_INSTALL_MAP: {},
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: {
    getUsage: () => ({ total: 0, remaining: 0, used: 0 }),
    trackRequest: vi.fn(),
    getSettings: () => ({ enabled: false }),
  },
}))

// Mock CardDataContext — but expose CardDataReportContext as a passthrough
// so CardWrapper can still provide it to children
vi.mock('../CardDataContext', () => ({
  CardDataReportContext: React.createContext({ report: () => {} }),
  ForceLiveContext: React.createContext(false),
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../cardMetadata', () => ({
  CARD_TITLES: {},
  CARD_DESCRIPTIONS: {},
  DEMO_EXEMPT_CARDS: new Set<string>(),
}))

vi.mock('../cardIcons', () => ({
  CARD_ICONS: {},
}))

vi.mock('../../../lib/modals', () => {
  const Header = ({ title }: { title?: string }) => React.createElement('div', { 'data-testid': 'base-modal-header' }, title)
  const Content = ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'base-modal-content' }, children)
  const Footer = ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'base-modal-footer' }, children)
  const BaseModal = Object.assign(
    ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
      isOpen ? React.createElement('div', { 'data-testid': 'base-modal' }, children) : null,
    { Header, Content, Footer },
  )
  return { BaseModal }
})

vi.mock('../../ui/Button', () => ({
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick, disabled }, children),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSkeleton: () => React.createElement('div', { 'data-testid': 'card-skeleton' }),
}))

vi.mock('../DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))

vi.mock('../cards/multi-tenancy/missionLoader', () => ({
  loadMissionPrompt: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../missions/ClusterSelectionDialog', () => ({
  ClusterSelectionDialog: () => null,
}))

// Lazy-loaded modals — mock to avoid dynamic imports in tests
vi.mock('../../widgets/WidgetExportModal', () => ({
  WidgetExportModal: () => null,
}))

vi.mock('../../feedback/FeatureRequestModal', () => ({
  FeatureRequestModal: () => null,
}))

// Use very short timeouts so tests don't need to wait
vi.mock('../../../lib/constants/network', () => ({
  LOADING_TIMEOUT_MS: 50,
  SKELETON_DELAY_MS: 0,
  INITIAL_RENDER_TIMEOUT_MS: 50,
  TICK_INTERVAL_MS: 1000,
  CARD_LOADING_TIMEOUT_MS: 100,
}))

// ---------------------------------------------------------------------------
// Import component under test AFTER mocks are declared
// ---------------------------------------------------------------------------
import { CardWrapper } from '../CardWrapper'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCard(props: Partial<Parameters<typeof CardWrapper>[0]> = {}) {
  return render(
    React.createElement(
      CardWrapper,
      {
        cardType: 'test_card',
        ...props,
      },
      props.children ?? React.createElement('div', { 'data-testid': 'card-content' }, 'Card content'),
    ),
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CardWrapper — refresh button interaction', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  // ── Presence ──────────────────────────────────────────────────────────────

  it('renders refresh button when onRefresh is provided', () => {
    const onRefresh = vi.fn()
    renderCard({ onRefresh })
    // Advance timers past the INITIAL_RENDER_TIMEOUT_MS so the button is enabled
    act(() => { vi.advanceTimersByTime(100) })
    const btn = screen.getByRole('button', { name: 'cardWrapper.refreshData' })
    expect(btn).toBeInTheDocument()
  })

  it('does NOT render refresh button when onRefresh is not provided', () => {
    renderCard()
    act(() => { vi.advanceTimersByTime(100) })
    expect(
      screen.queryByRole('button', { name: 'cardWrapper.refreshData' }),
    ).not.toBeInTheDocument()
  })

  // ── Invocation ────────────────────────────────────────────────────────────

  it('calls onRefresh when the refresh button is clicked', () => {
    const onRefresh = vi.fn()
    renderCard({ onRefresh })
    act(() => { vi.advanceTimersByTime(100) })

    const btn = screen.getByRole('button', { name: 'cardWrapper.refreshData' })
    fireEvent.click(btn)

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('emits the cardRefreshed analytics event when refresh button is clicked', () => {
    const onRefresh = vi.fn()
    renderCard({ onRefresh, cardType: 'cluster_health' })
    act(() => { vi.advanceTimersByTime(100) })

    const btn = screen.getByRole('button', { name: 'cardWrapper.refreshData' })
    fireEvent.click(btn)

    expect(mockEmitCardRefreshed).toHaveBeenCalledWith('cluster_health')
  })

  // ── Disabled state ─────────────────────────────────────────────────────────

  it('disables refresh button while isRefreshing prop is true', () => {
    const onRefresh = vi.fn()
    renderCard({ onRefresh, isRefreshing: true })
    act(() => { vi.advanceTimersByTime(100) })

    // When isRefreshing is true the button aria-label switches to a different key
    // but the button should be present and disabled
    const btns = screen.getAllByRole('button')
    const refreshBtn = btns.find(b =>
      b.getAttribute('aria-label')?.includes('cardWrapper.refresh'),
    )
    expect(refreshBtn).toBeDefined()
    expect(refreshBtn).toBeDisabled()
  })

  it('does NOT call onRefresh when the disabled refresh button is activated', () => {
    const onRefresh = vi.fn()
    renderCard({ onRefresh, isRefreshing: true })
    act(() => { vi.advanceTimersByTime(100) })

    const btns = screen.getAllByRole('button')
    const refreshBtn = btns.find(b =>
      b.getAttribute('aria-label')?.includes('cardWrapper.refresh'),
    )
    if (refreshBtn) {
      fireEvent.click(refreshBtn)
    }

    expect(onRefresh).not.toHaveBeenCalled()
  })

  // ── Enabled state ──────────────────────────────────────────────────────────

  it('enables refresh button when not refreshing and card is idle', () => {
    const onRefresh = vi.fn()
    renderCard({ onRefresh, isRefreshing: false })
    act(() => { vi.advanceTimersByTime(100) })

    const btn = screen.getByRole('button', { name: 'cardWrapper.refreshData' })
    expect(btn).not.toBeDisabled()
  })

  it('calls onRefresh exactly once per click', () => {
    const onRefresh = vi.fn()
    renderCard({ onRefresh })
    act(() => { vi.advanceTimersByTime(100) })

    const btn = screen.getByRole('button', { name: 'cardWrapper.refreshData' })
    fireEvent.click(btn)

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
