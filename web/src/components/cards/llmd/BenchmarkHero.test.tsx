import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockUseCachedBenchmarkReports,
  mockResetBenchmarkStream,
  mockUseReportCardDataState,
} = vi.hoisted(() => ({
  mockUseCachedBenchmarkReports: vi.fn(),
  mockResetBenchmarkStream: vi.fn(),
  mockUseReportCardDataState: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../hooks/useBenchmarkData', () => ({
  useCachedBenchmarkReports: () => mockUseCachedBenchmarkReports(),
  resetBenchmarkStream: (...args: unknown[]) => mockResetBenchmarkStream(...args),
}))

vi.mock('../CardDataContext', () => ({
  useReportCardDataState: (...args: unknown[]) => mockUseReportCardDataState(...args),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Stub framer-motion to render plain divs in tests
vi.mock('framer-motion', () => {
  const motionProxy = new Proxy({}, {
    get: (_target, prop) => {
      return ({ children, ...rest }: Record<string, unknown>) => {
        // Strip motion-specific props before forwarding to the DOM element
        const {
          initial, animate, transition, whileHover, whileTap, exit, variants, layout,
          ...domProps
        } = rest
        const Tag = String(prop)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const React = require('react') as any
        return React.createElement(Tag, domProps, children)
      }
    },
  })
  return {
    motion: motionProxy,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  }
})

vi.mock('../../../lib/llmd/benchmarkMockData', () => ({
  getHardwareShort: (s: string) => s || 'GPU',
  getModelShort: (s: string) => s || 'Model',
  CONFIG_COLORS: {
    standalone: '#10b981',
    disaggregated: '#3b82f6',
    scheduling: '#f59e0b',
  } as Record<string, string>,
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { BenchmarkHero } from './BenchmarkHero'

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeBenchmarkReport(overrides: Record<string, unknown> = {}) {
  return {
    run: {
      eid: 'test-run-1',
      time: {
        start: '2025-01-15T10:00:00Z',
        duration: 'PT300S',
      },
      ...((overrides.run ?? {}) as Record<string, unknown>),
    },
    scenario: {
      stack: [
        {
          metadata: { label: 'vLLM Engine', cfg_id: 'engine-1' },
          standardized: {
            kind: 'inference_engine',
            tool: 'vllm',
            tool_version: 'v0.6.0:latest',
            role: 'prefill',
            model: { name: 'meta-llama/Llama-3.1-70B' },
            accelerator: { model: 'NVIDIA A100', count: 4 },
          },
        },
      ],
      ...((overrides.scenario ?? {}) as Record<string, unknown>),
    },
    results: {
      request_performance: {
        aggregate: {
          throughput: {
            output_token_rate: { mean: 1500, units: 'tokens/s' },
          },
          latency: {
            time_to_first_token: { p50: 0.025, units: 'seconds' },
            time_per_output_token: { p50: 0.0067, units: 'seconds' },
            request_latency: { p50: 2.5, units: 'seconds' },
          },
          requests: {
            total: 10000,
            failures: 5,
          },
        },
      },
      observability: {
        metrics: [
          { name: 'gpu_util', samples: [{ value: 85 }] },
          { name: 'gpu_power', samples: [{ value: 250 }] },
        ],
      },
      ...((overrides.results ?? {}) as Record<string, unknown>),
    },
  }
}

function defaultHookResult(overrides: Record<string, unknown> = {}) {
  return {
    data: [],
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    isLoading: false,
    isRefreshing: false,
    currentSince: '30d',
    isStreaming: false,
    streamProgress: 0,
    streamStatus: '',
    error: null,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BenchmarkHero', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseReportCardDataState.mockImplementation(() => {})
  })

  it('renders empty state when no reports and no demo fallback', () => {
    mockUseCachedBenchmarkReports.mockReturnValue(defaultHookResult())

    render(<BenchmarkHero />)

    expect(screen.getByText('No benchmark data available')).toBeInTheDocument()
  })

  it('renders live metrics when isDemoFallback=false and live reports exist', () => {
    const report = makeBenchmarkReport()
    mockUseCachedBenchmarkReports.mockReturnValue(defaultHookResult({
      data: [report],
      isDemoFallback: false,
    }))

    render(<BenchmarkHero />)

    expect(screen.getByText('Output Throughput')).toBeInTheDocument()
    expect(screen.getByText('TTFT (p50)')).toBeInTheDocument()
    expect(screen.getByText('TPOT (p50)')).toBeInTheDocument()
    expect(screen.getByText('Req Latency (p50)')).toBeInTheDocument()
    expect(screen.getByText('1.5k')).toBeInTheDocument()
    expect(screen.getByText('tok/s')).toBeInTheDocument()
  })

  it('does not show demo state in non-demo live path', () => {
    mockUseCachedBenchmarkReports.mockReturnValue(defaultHookResult({
      data: [],
      isDemoFallback: false,
    }))

    render(<BenchmarkHero />)

    expect(screen.getByText('No benchmark data available')).toBeInTheDocument()

    expect(mockUseReportCardDataState).toHaveBeenCalledWith(
      expect.objectContaining({ isDemoData: false })
    )
  })

  it('passes isDemoData=true to card data state when demo fallback is active', () => {
    const report = makeBenchmarkReport()
    mockUseCachedBenchmarkReports.mockReturnValue(defaultHookResult({
      data: [report],
      isDemoFallback: true,
    }))

    render(<BenchmarkHero />)

    expect(mockUseReportCardDataState).toHaveBeenCalledWith(
      expect.objectContaining({ isDemoData: true })
    )
  })

  it('time range selector triggers resetBenchmarkStream', () => {
    const report = makeBenchmarkReport()
    mockUseCachedBenchmarkReports.mockReturnValue(defaultHookResult({
      data: [report],
      currentSince: '30d',
    }))

    render(<BenchmarkHero />)

    const select = screen.getByDisplayValue('30 days')
    fireEvent.change(select, { target: { value: '90d' } })

    expect(mockResetBenchmarkStream).toHaveBeenCalledWith('90d')
  })

  it('custom days flow triggers resetBenchmarkStream with correct value', () => {
    const report = makeBenchmarkReport()
    mockUseCachedBenchmarkReports.mockReturnValue(defaultHookResult({
      data: [report],
      currentSince: '30d',
    }))

    render(<BenchmarkHero />)

    const select = screen.getByDisplayValue('30 days')
    fireEvent.change(select, { target: { value: 'custom' } })

    const input = screen.getByPlaceholderText('days')
    expect(input).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '45' } })
    fireEvent.click(screen.getByText('Go'))

    expect(mockResetBenchmarkStream).toHaveBeenCalledWith('45d')
  })

  it('displays correct bottom strip metrics', () => {
    const report = makeBenchmarkReport()
    mockUseCachedBenchmarkReports.mockReturnValue(defaultHookResult({
      data: [report],
    }))

    render(<BenchmarkHero />)

    expect(screen.getByText('Requests:')).toBeInTheDocument()
    expect(screen.getByText('10,000')).toBeInTheDocument()
    expect(screen.getByText('Failures:')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('GPU Util:')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('Power:')).toBeInTheDocument()
    expect(screen.getByText('250W')).toBeInTheDocument()
  })

  it('renders delta indicators for metrics', () => {
    const report = makeBenchmarkReport()
    mockUseCachedBenchmarkReports.mockReturnValue(defaultHookResult({
      data: [report],
    }))

    const { container } = render(<BenchmarkHero />)

    // Delta percentages should be rendered (exact values depend on prev vs latest comparison)
    const deltas = container.querySelectorAll('.text-green-400, .text-red-400')
    expect(deltas.length).toBeGreaterThan(0)
  })
})
