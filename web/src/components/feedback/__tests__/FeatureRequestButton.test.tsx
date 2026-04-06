import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'

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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../hooks/useFeatureRequests', () => ({
  useNotifications: () => ({ unreadCount: 0 }),
}))

const mockOpen = vi.fn()
const mockSetFullScreen = vi.fn()

vi.mock('../../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: mockOpen, close: vi.fn() }),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: vi.fn(),
}))

import { useMissions } from '../../../hooks/useMissions'
import { FeatureRequestButton } from '../FeatureRequestButton'

describe('FeatureRequestButton', () => {
  beforeEach(() => {
    mockOpen.mockClear()
    mockSetFullScreen.mockClear()
    vi.mocked(useMissions).mockReturnValue({ isFullScreen: false, setFullScreen: mockSetFullScreen } as ReturnType<typeof useMissions>)
  })

  it('renders without crashing', () => {
    const { container } = render(<FeatureRequestButton />)
    expect(container).toBeTruthy()
  })

  it('opens the modal without touching fullscreen when sidebar is not in fullscreen mode', () => {
    const { getByTitle } = render(<FeatureRequestButton />)
    fireEvent.click(getByTitle('Report a bug or request a feature'))
    expect(mockOpen).toHaveBeenCalledTimes(1)
    expect(mockSetFullScreen).not.toHaveBeenCalled()
  })

  it('exits fullscreen mission sidebar before opening the modal', () => {
    vi.mocked(useMissions).mockReturnValue({ isFullScreen: true, setFullScreen: mockSetFullScreen } as ReturnType<typeof useMissions>)
    const { getByTitle } = render(<FeatureRequestButton />)
    fireEvent.click(getByTitle('Report a bug or request a feature'))
    expect(mockSetFullScreen).toHaveBeenCalledWith(false)
    expect(mockOpen).toHaveBeenCalledTimes(1)
    // Verify fullscreen is exited before the modal opens
    expect(mockSetFullScreen.mock.invocationCallOrder[0]).toBeLessThan(mockOpen.mock.invocationCallOrder[0])
  })
})
