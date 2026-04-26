/**
 * Tests for useNavigationHistory hook.
 *
 * The hook itself requires react-router-dom context, so we test
 * the hook with a mocked router.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const STORAGE_KEY = 'kubestellar-nav-history'

// Mock react-router-dom
const mockPathname = { current: '/' }
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPathname.current, search: '', hash: '' }),
}))

// Dynamically import after mocking
let useNavigationHistory: typeof import('../useNavigationHistory').useNavigationHistory

describe('useNavigationHistory', () => {
  beforeEach(async () => {
    localStorage.clear()
    mockPathname.current = '/'
    vi.resetModules()
    // Re-mock after resetModules
    vi.doMock('react-router-dom', () => ({
      useLocation: () => ({ pathname: mockPathname.current, search: '', hash: '' }),
    }))
    const mod = await import('../useNavigationHistory')
    useNavigationHistory = mod.useNavigationHistory
  })

  describe('useNavigationHistory hook', () => {
    it('should record a visit to localStorage on mount', () => {
      mockPathname.current = '/clusters'
      renderHook(() => useNavigationHistory())

      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(history).toContain('/clusters')
    })

    it('should prepend new visits to the front of history', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['/events', '/clusters']))
      mockPathname.current = '/workloads'
      renderHook(() => useNavigationHistory())

      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(history[0]).toBe('/workloads')
      expect(history[1]).toBe('/events')
      expect(history[2]).toBe('/clusters')
    })

    it('should not track auth-related pages', () => {
      mockPathname.current = '/auth/callback'
      renderHook(() => useNavigationHistory())

      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(history).not.toContain('/auth/callback')
    })

    it('should not track /login page', () => {
      mockPathname.current = '/login'
      renderHook(() => useNavigationHistory())

      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(history).not.toContain('/login')
    })

    it('should cap history at 100 entries', () => {
      // Fill with 100 entries
      const existing = Array.from({ length: 100 }, (_, i) => `/page-${i}`)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))

      mockPathname.current = '/new-page'
      renderHook(() => useNavigationHistory())

      const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(history.length).toBe(100)
      expect(history[0]).toBe('/new-page')
      // Last entry from original should be dropped
      expect(history).not.toContain('/page-99')
    })
  })
})
