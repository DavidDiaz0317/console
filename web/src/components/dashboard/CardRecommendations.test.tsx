import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import * as CardRecommendationsModule from './CardRecommendations'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.title) return `Add ${opts.title} card`
      if (opts?.count) return `${opts.count} critical`
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

const mockRecommendations = [
  { id: 'rec-1', cardType: 'pod_issues', title: 'Pod Issues', reason: 'Pods need attention', priority: 'high' as const },
]

vi.mock('../../hooks/useCardRecommendations', () => ({
  useCardRecommendations: () => ({
    recommendations: mockRecommendations,
    hasRecommendations: true,
    highPriorityCount: 1,
  }),
}))

vi.mock('../../hooks/useSnoozedRecommendations', () => ({
  useSnoozedRecommendations: () => ({
    snoozeRecommendation: vi.fn(),
    dismissRecommendation: vi.fn(),
    isSnoozed: () => false,
    isDismissed: () => false,
    snoozedRecommendations: [],
  }),
}))

vi.mock('../../lib/analytics', () => ({
  emitCardRecommendationsShown: vi.fn(),
  emitCardRecommendationActioned: vi.fn(),
}))

// Start in minimized state so the chip buttons with aria-haspopup="menu" are rendered
vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => 'true'),
  safeSetItem: vi.fn(),
}))

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CardRecommendations Component', () => {
  it('exports CardRecommendations component', () => {
    expect(CardRecommendationsModule.CardRecommendations).toBeDefined()
    expect(typeof CardRecommendationsModule.CardRecommendations).toBe('function')
  })

  describe('listener-leak fix: deferred addEventListener race condition', () => {
    let addEventListenerSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      vi.useFakeTimers()
      addEventListenerSpy = vi.spyOn(document, 'addEventListener')
    })

    afterEach(() => {
      vi.useRealTimers()
      addEventListenerSpy.mockRestore()
    })

    it('does not add document listeners when unmount races the deferred setTimeout', () => {
      const { unmount, container } = render(
        <CardRecommendationsModule.CardRecommendations
          currentCardTypes={[]}
          onAddCard={vi.fn()}
        />,
      )

      // Click a chip to open the dropdown (sets expandedRec, schedules the deferred addEventListener)
      const chip = container.querySelector('button[aria-haspopup="menu"]')
      expect(chip).not.toBeNull()
      fireEvent.click(chip!)

      // Unmount BEFORE the 0ms setTimeout fires — this is the race condition scenario
      unmount()

      // Capture the count of document.addEventListener calls so far
      const callsBefore = addEventListenerSpy.mock.calls.length

      // Advance timers so the deferred setTimeout would fire (if not cancelled)
      act(() => { vi.advanceTimersByTime(50) })

      // With the fix, the cancelled flag prevents any new listeners from being added
      expect(addEventListenerSpy.mock.calls.length).toBe(callsBefore)
    })

    it('adds document listeners after the deferred setTimeout when the component is still mounted', () => {
      const { container } = render(
        <CardRecommendationsModule.CardRecommendations
          currentCardTypes={[]}
          onAddCard={vi.fn()}
        />,
      )

      // Click a chip to trigger the deferred addEventListener
      const chip = container.querySelector('button[aria-haspopup="menu"]')
      expect(chip).not.toBeNull()

      addEventListenerSpy.mockClear()
      fireEvent.click(chip!)

      // Before the timeout fires, no document listeners added yet
      expect(addEventListenerSpy.mock.calls.length).toBe(0)

      // After the timeout fires, listeners should be registered
      act(() => { vi.advanceTimersByTime(50) })

      const registeredEvents = addEventListenerSpy.mock.calls.map(c => c[0])
      expect(registeredEvents).toContain('mousedown')
      expect(registeredEvents).toContain('keydown')
    })
  })
})
