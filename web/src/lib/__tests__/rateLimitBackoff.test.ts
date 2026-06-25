import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_RATE_LIMIT_RETRY_AFTER_S,
  RateLimitError,
  getRateLimitBackoff,
  isRateLimitBackoffActive,
  setRateLimitBackoffFromResponse,
  throwIfRateLimited,
  waitForRateLimitBackoff,
} from '../rateLimitBackoff'

beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('rateLimitBackoff', () => {
  it('stores and reads Retry-After seconds', () => {
    const response = new Response('', {
      status: 429,
      headers: { 'Retry-After': '15' },
    })

    const state = setRateLimitBackoffFromResponse(response)

    expect(state.retryAfter).toBe(15)
    expect(isRateLimitBackoffActive()).toBe(true)
    expect(getRateLimitBackoff()?.retryAfter).toBeGreaterThan(0)
  })

  it('falls back when Retry-After is missing', () => {
    const response = new Response('', { status: 429 })

    const state = setRateLimitBackoffFromResponse(response)

    expect(state.retryAfter).toBe(DEFAULT_RATE_LIMIT_RETRY_AFTER_S)
  })

  it('throws a RateLimitError while the backoff is active', () => {
    setRateLimitBackoffFromResponse(new Response('', {
      status: 429,
      headers: { 'Retry-After': '30' },
    }))

    expect(() => throwIfRateLimited()).toThrow(RateLimitError)
    try {
      throwIfRateLimited()
    } catch (error) {
      expect((error as RateLimitError).retryAfter).toBeGreaterThan(0)
    }
  })

  it('clears expired backoff state', () => {
    localStorage.setItem('kc-api-rate-limit-until', String(Date.now() - 1))

    expect(getRateLimitBackoff()).toBeNull()
    expect(localStorage.getItem('kc-api-rate-limit-until')).toBeNull()
  })

  it('waits until the active backoff clears', async () => {
    vi.useFakeTimers()
    setRateLimitBackoffFromResponse(new Response('', {
      status: 429,
      headers: { 'Retry-After': '1' },
    }))

    const pending = waitForRateLimitBackoff()
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(pending).resolves.toBeUndefined()
  })
})
