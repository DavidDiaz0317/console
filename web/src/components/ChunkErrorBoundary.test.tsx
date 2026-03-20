import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChunkErrorBoundary } from './ChunkErrorBoundary'

// Mock analytics so we can verify which events are emitted
vi.mock('../lib/analytics', () => ({
  emitError: vi.fn(),
  emitChunkReloadRecoveryFailed: vi.fn(),
  emitStaleChunkDetected: vi.fn(),
  markErrorReported: vi.fn(),
}))

// Import analytics mocks after vi.mock()
import * as analytics from '../lib/analytics'

// Mock i18next so translations resolve to English strings
vi.mock('i18next', () => ({
  default: {
    t: (key: string) => {
      const translations: Record<string, string> = {
        'common:chunkError.appUpdated': 'App Updated',
        'common:chunkError.newVersionDeployed': 'A new version was deployed. Please reload to continue.',
        'common:chunkError.reloadPage': 'Reload Page',
      }
      return translations[key] ?? key
    },
  },
}))

describe('ChunkErrorBoundary Component', () => {
  let reloadSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear()
    // Mock window.location.reload
    reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy, pathname: '/cluster-admin' },
      writable: true,
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when no error', () => {
    render(
      <ChunkErrorBoundary>
        <div>Test Child Content</div>
      </ChunkErrorBoundary>
    )
    expect(screen.getByText('Test Child Content')).toBeTruthy()
  })

  it('renders reload UI on chunk load error', () => {
    const ThrowError = () => {
      throw new Error('Failed to fetch dynamically imported module')
    }

    // Suppress console.error and console.warn for this test
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <ChunkErrorBoundary>
        <ThrowError />
      </ChunkErrorBoundary>
    )

    expect(screen.getByText('App Updated')).toBeTruthy()
    expect(screen.getByText(/A new version was deployed/)).toBeTruthy()
    expect(screen.getByText('Reload Page')).toBeTruthy()
  })

  it('emits soft stale-chunk event (not error) on first chunk error and auto-reloads', () => {
    const ThrowError = () => {
      throw new Error('Failed to fetch dynamically imported module')
    }

    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <ChunkErrorBoundary>
        <ThrowError />
      </ChunkErrorBoundary>
    )

    // Should emit soft stale-chunk event, NOT the hard chunk_load error
    expect(analytics.emitStaleChunkDetected).toHaveBeenCalledOnce()
    expect(analytics.emitError).not.toHaveBeenCalled()
    // Should auto-reload to recover
    expect(reloadSpy).toHaveBeenCalledOnce()
  })

  it('emits chunk_load error when recovery has already been attempted (recovery failed)', () => {
    // Simulate that auto-reload already happened recently (within throttle window)
    sessionStorage.setItem('chunk-reload-ts', String(Date.now()))

    const ThrowError = () => {
      throw new Error('Failed to fetch dynamically imported module')
    }

    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <ChunkErrorBoundary>
        <ThrowError />
      </ChunkErrorBoundary>
    )

    // Recovery failed — should emit the hard chunk_load error and recovery-failed event
    expect(analytics.emitError).toHaveBeenCalledWith('chunk_load', expect.any(String))
    expect(analytics.emitChunkReloadRecoveryFailed).toHaveBeenCalledOnce()
    // Should NOT auto-reload again (user sees manual reload UI)
    expect(reloadSpy).not.toHaveBeenCalled()
    // Should NOT emit soft stale-chunk event for recovery failures
    expect(analytics.emitStaleChunkDetected).not.toHaveBeenCalled()
  })

  it('does not catch non-chunk errors', () => {
    const ThrowError = () => {
      throw new Error('Some other error')
    }

    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      render(
        <ChunkErrorBoundary>
          <ThrowError />
        </ChunkErrorBoundary>
      )
    }).toThrow('Some other error')
  })

  it('renders loading state children without interference', () => {
    render(
      <ChunkErrorBoundary>
        <div>Loading...</div>
      </ChunkErrorBoundary>
    )
    expect(screen.getByText('Loading...')).toBeTruthy()
  })
})
