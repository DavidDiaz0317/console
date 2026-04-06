/**
 * DynamicCardErrorBoundary Tests
 *
 * Covers:
 * - Normal render: children are rendered without interference
 * - Error isolation: render errors from children show fallback UI instead of crashing
 * - Error message: the caught error message is displayed
 * - Retry behavior: clicking Retry resets the boundary
 * - Retry limit: after MAX_RETRY_ATTEMPTS retries fail, retry button is removed
 * - onError callback: called when a render error is caught
 * - Chunk load errors: propagated instead of caught (handled by ChunkErrorBoundary)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'

// Mock analytics to avoid side-effects
vi.mock('../../../lib/analytics', () => ({
  emitError: vi.fn(),
  markErrorReported: vi.fn(),
}))

// Mock chunkErrors — control which errors are treated as chunk errors
vi.mock('../../../lib/chunkErrors', () => ({
  isChunkLoadError: (error: Error) =>
    error.message.includes('dynamically imported module'),
}))

/** Component that throws an error during render */
function ThrowError({ message }: { message: string }) {
  throw new Error(message)
  return null
}

// MAX_RETRY_ATTEMPTS matches the constant in DynamicCardErrorBoundary
const MAX_RETRY_ATTEMPTS = 3

describe('DynamicCardErrorBoundary', () => {
  beforeEach(() => {
    // Suppress React's error logging to keep test output clean
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Normal render ─────────────────────────────────────────────────────

  it('renders children when there is no error', () => {
    render(
      <DynamicCardErrorBoundary cardId="test-card">
        <div>Card content</div>
      </DynamicCardErrorBoundary>,
    )
    expect(screen.getByText('Card content')).toBeTruthy()
  })

  it('renders multiple children normally', () => {
    render(
      <DynamicCardErrorBoundary cardId="test-card">
        <span>First</span>
        <span>Second</span>
      </DynamicCardErrorBoundary>,
    )
    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByText('Second')).toBeTruthy()
  })

  // ── Error isolation ───────────────────────────────────────────────────

  it('catches render errors and shows fallback UI instead of crashing', () => {
    render(
      <DynamicCardErrorBoundary cardId="test-card">
        <ThrowError message="Render crash" />
      </DynamicCardErrorBoundary>,
    )

    expect(screen.getByText('Card Render Error')).toBeTruthy()
  })

  it('displays the caught error message', () => {
    render(
      <DynamicCardErrorBoundary cardId="bad-card">
        <ThrowError message="Something went wrong in the card" />
      </DynamicCardErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong in the card')).toBeTruthy()
  })

  it('does not render children after catching an error', () => {
    render(
      <DynamicCardErrorBoundary cardId="test-card">
        <ThrowError message="fatal error" />
      </DynamicCardErrorBoundary>,
    )

    // The error fallback UI is shown; the child content is not
    expect(screen.queryByText('Card content')).toBeNull()
    expect(screen.getByText('Card Render Error')).toBeTruthy()
  })

  // ── Retry behavior ────────────────────────────────────────────────────

  it('shows a retry button with remaining count when error is caught', () => {
    render(
      <DynamicCardErrorBoundary cardId="test-card">
        <ThrowError message="recoverable error" />
      </DynamicCardErrorBoundary>,
    )

    const retryButton = screen.getByRole('button', { name: /retry/i })
    expect(retryButton).toBeTruthy()
    expect(retryButton.textContent).toContain(`${MAX_RETRY_ATTEMPTS}`)
  })

  it('resets the boundary and re-renders children when Retry is clicked and child recovers', () => {
    let shouldThrow = true
    const Conditional = () => {
      if (shouldThrow) throw new Error('transient error')
      return <div>Recovered content</div>
    }

    const { rerender } = render(
      <DynamicCardErrorBoundary cardId="test-card">
        <Conditional />
      </DynamicCardErrorBoundary>,
    )

    expect(screen.getByText('Card Render Error')).toBeTruthy()

    // Stop the child from throwing, then retry
    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    rerender(
      <DynamicCardErrorBoundary cardId="test-card">
        <Conditional />
      </DynamicCardErrorBoundary>,
    )

    expect(screen.getByText('Recovered content')).toBeTruthy()
    expect(screen.queryByText('Card Render Error')).toBeNull()
  })

  it('decrements the retry count when a retry attempt also fails', () => {
    render(
      <DynamicCardErrorBoundary cardId="test-card">
        <ThrowError message="persistent error" />
      </DynamicCardErrorBoundary>,
    )

    // Initial state: MAX_RETRY_ATTEMPTS retries remaining
    expect(screen.getByRole('button', { name: /retry/i }).textContent)
      .toContain(`${MAX_RETRY_ATTEMPTS}`)

    // First failed retry
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(screen.getByRole('button', { name: /retry/i }).textContent)
      .toContain(`${MAX_RETRY_ATTEMPTS - 1}`)

    // Second failed retry
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(screen.getByRole('button', { name: /retry/i }).textContent)
      .toContain(`${MAX_RETRY_ATTEMPTS - 2}`)
  })

  // ── Retry limit ───────────────────────────────────────────────────────

  it('removes the retry button after MAX_RETRY_ATTEMPTS failed retries', () => {
    render(
      <DynamicCardErrorBoundary cardId="test-card">
        <ThrowError message="persistent error" />
      </DynamicCardErrorBoundary>,
    )

    // Exhaust all retry attempts
    for (let i = 0; i < MAX_RETRY_ATTEMPTS; i++) {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    }

    // Retry button should no longer be present
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('shows "Reload the page" message after retries are exhausted', () => {
    render(
      <DynamicCardErrorBoundary cardId="test-card">
        <ThrowError message="persistent error" />
      </DynamicCardErrorBoundary>,
    )

    for (let i = 0; i < MAX_RETRY_ATTEMPTS; i++) {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    }

    expect(screen.getByText(/reload the page/i)).toBeTruthy()
  })

  // ── onError callback ──────────────────────────────────────────────────

  it('calls the onError callback when a render error is caught', () => {
    const onError = vi.fn()

    render(
      <DynamicCardErrorBoundary cardId="test-card" onError={onError}>
        <ThrowError message="callback test error" />
      </DynamicCardErrorBoundary>,
    )

    expect(onError).toHaveBeenCalledOnce()
    const [error] = onError.mock.calls[0] as [Error, unknown]
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('callback test error')
  })

  it('calls onError with errorInfo (componentStack) on render failure', () => {
    const onError = vi.fn()

    render(
      <DynamicCardErrorBoundary cardId="test-card" onError={onError}>
        <ThrowError message="info test" />
      </DynamicCardErrorBoundary>,
    )

    expect(onError).toHaveBeenCalledOnce()
    const [, errorInfo] = onError.mock.calls[0] as [Error, React.ErrorInfo]
    expect(errorInfo).toBeDefined()
    expect(typeof errorInfo.componentStack).toBe('string')
  })

  // ── Chunk load error propagation ──────────────────────────────────────

  it('lets chunk load errors propagate instead of catching them', () => {
    const ThrowChunkError = () => {
      throw new Error('Failed to fetch dynamically imported module /chunk-abc.js')
    }

    expect(() => {
      render(
        <DynamicCardErrorBoundary cardId="test-card">
          <ThrowChunkError />
        </DynamicCardErrorBoundary>,
      )
    }).toThrow('dynamically imported module')
  })

  // ── cardId in error output ────────────────────────────────────────────

  it('logs the cardId with the error to the console', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <DynamicCardErrorBoundary cardId="my-custom-card">
        <ThrowError message="logged error" />
      </DynamicCardErrorBoundary>,
    )

    const calls = consoleSpy.mock.calls.flat().join(' ')
    expect(calls).toContain('my-custom-card')
  })
})
