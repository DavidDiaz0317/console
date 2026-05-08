import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

const modalState = {
  isOpen: false,
  close: vi.fn(),
  toggle: vi.fn(),
}

vi.mock('../../../lib/modals', () => ({
  useModalState: () => modalState,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'statBlockModePicker.changeDisplayMode': 'Change display mode',
      'statBlockModePicker.displayMode': 'Display mode',
      'statBlockModePicker.number': 'Number',
      'statBlockModePicker.sparkline': 'Sparkline',
      'statBlockModePicker.gauge': 'Gauge',
      'statBlockModePicker.horseshoe': 'Horseshoe',
      'statBlockModePicker.ring': 'Ring',
      'statBlockModePicker.bar': 'Bar',
      'statBlockModePicker.trend': 'Trend',
      'statBlockModePicker.stacked': 'Stacked',
      'statBlockModePicker.heatmap': 'Heatmap',
    }[key] ?? key),
  }),
}))

import { StatBlockModePicker } from '../StatBlockModePicker'

describe('StatBlockModePicker', () => {
  const originalInnerWidth = window.innerWidth

  beforeEach(() => {
    modalState.isOpen = false
    modalState.close.mockClear()
    modalState.toggle.mockClear()
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true })
  })

  it('renders without crashing', () => {
    const { container } = render(<StatBlockModePicker currentMode="numeric" availableModes={["numeric"]} onModeChange={vi.fn()} />)
    expect(container).toBeTruthy()
  })

  it('repositions the open popover on scroll and resize', () => {
    modalState.isOpen = true

    let triggerRight = 240
    let triggerBottom = 64
    const getBoundingClientRect = vi.fn(() => ({
      top: triggerBottom - 24,
      left: triggerRight - 32,
      right: triggerRight,
      bottom: triggerBottom,
      width: 32,
      height: 24,
      x: triggerRight - 32,
      y: triggerBottom - 24,
      toJSON: () => ({}),
    }))

    const { container } = render(
      <StatBlockModePicker currentMode="numeric" availableModes={["numeric", "sparkline"]} onModeChange={vi.fn()} />,
    )

    const triggerButton = container.querySelector('button')
    expect(triggerButton).toBeTruthy()
    Object.defineProperty(triggerButton as HTMLButtonElement, 'getBoundingClientRect', {
      value: getBoundingClientRect,
      configurable: true,
    })

    fireEvent.resize(window)
    const menu = screen.getByRole('menu', { name: 'Display mode' })
    expect(menu.style.top).toBe('68px')
    expect(menu.style.left).toBe('80px')

    triggerRight = 420
    triggerBottom = 120
    fireEvent.scroll(window)

    expect(menu.style.top).toBe('124px')
    expect(menu.style.left).toBe('260px')
  })
})
