import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { PodAiAnalysis } from '../PodAiAnalysis'

describe('PodAiAnalysis', () => {
  it('renders without crashing', () => {
    const { container } = render(<PodAiAnalysis aiAnalysis={null} aiAnalysisLoading={false} fetchAiAnalysis={vi.fn()} handleRepairPod={vi.fn()} />)
    expect(container).toBeTruthy()
  })

  it('shows error state when aiAnalysisError is provided', () => {
    render(
      <PodAiAnalysis
        aiAnalysis={null}
        aiAnalysisLoading={false}
        aiAnalysisError="Could not connect to AI analysis service."
        fetchAiAnalysis={vi.fn()}
        handleRepairPod={vi.fn()}
      />
    )
    expect(screen.getByText('drilldown.ai.analysisFailed')).toBeTruthy()
    expect(screen.getByText('Could not connect to AI analysis service.')).toBeTruthy()
  })

  it('shows loading state when aiAnalysisLoading is true', () => {
    render(
      <PodAiAnalysis
        aiAnalysis={null}
        aiAnalysisLoading={true}
        fetchAiAnalysis={vi.fn()}
        handleRepairPod={vi.fn()}
      />
    )
    expect(screen.getByText('common.analyzing')).toBeTruthy()
  })

  it('shows analysis result when aiAnalysis has content', () => {
    render(
      <PodAiAnalysis
        aiAnalysis="Pod is OOMKilled due to memory limits."
        aiAnalysisLoading={false}
        fetchAiAnalysis={vi.fn()}
        handleRepairPod={vi.fn()}
      />
    )
    expect(screen.getByText('Pod is OOMKilled due to memory limits.')).toBeTruthy()
  })
})
