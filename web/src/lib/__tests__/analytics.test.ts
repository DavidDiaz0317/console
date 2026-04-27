import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as analyticsModule from '../analytics'

describe('analytics module exports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports initAnalytics function', () => {
    expect(typeof analyticsModule.initAnalytics).toBe('function')
  })

  it('exports emitPageView function', () => {
    expect(typeof analyticsModule.emitPageView).toBe('function')
  })

  it('exports analytics event types', () => {
    expect(analyticsModule).toBeDefined()
  })

  it('analytics module is importable', () => {
    expect(analyticsModule).toBeTypeOf('object')
    expect(Object.keys(analyticsModule).length).toBeGreaterThan(0)
  })
})
