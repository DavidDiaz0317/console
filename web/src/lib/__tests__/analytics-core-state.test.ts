/**
 * Tests for lib/analytics-core-state.ts
 *
 * Provides direct coverage for all module-level state variables and their
 * corresponding setter functions. Since the state is module-scoped,
 * resetAnalyticsCoreState() is called before each test.
 *
 * Uses namespace import (`import * as S`) so every read of S.measurementId
 * reflects the current live binding value after a setter call.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import * as S from '../analytics-core-state'

beforeEach(() => {
  S.resetAnalyticsCoreState()
})

describe('default constants', () => {
  it('DEFAULT_PROXY_MEASUREMENT_ID is a G- id', () => {
    expect(S.DEFAULT_PROXY_MEASUREMENT_ID).toMatch(/^G-/)
  })

  it('DEFAULT_GTAG_MEASUREMENT_ID is a non-empty G- id', () => {
    expect(S.DEFAULT_GTAG_MEASUREMENT_ID).toMatch(/^G-/)
  })

  it('DEFAULT_UMAMI_WEBSITE_ID is a UUID-shaped string', () => {
    expect(S.DEFAULT_UMAMI_WEBSITE_ID).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('resetAnalyticsCoreState', () => {
  it('resets measurementId to empty string', () => {
    S.setMeasurementId('G-TEST')
    S.resetAnalyticsCoreState()
    // Re-import to read current module state
    expect(S.measurementId).toBe('')
  })

  it('resets all state to defaults after mutations', () => {
    S.setMeasurementId('G-TEST')
    S.setPageId('/page')
    S.replaceUserProperties({ role: 'admin' })
    S.setUserId('user-1')
    S.setInitialized(true)
    S.setUserHasInteracted(true)
    S.setAnalyticsScriptsLoaded(true)
    S.setPendingRecoveryEvent({ type: 'error', payload: {} } as never)
    S.setSessionEngaged(true)
    S.setGtagMeasurementId('G-OTHER')
    S.setUmamiWebsiteId('other-uuid')
    S.setRealMeasurementId('G-REAL')

    S.resetAnalyticsCoreState()

    // Module-level state is live — after reset they read back to defaults
    expect(S.measurementId).toBe('')
    expect(S.pageId).toBe('')
    expect(S.initialized).toBe(false)
    expect(S.userHasInteracted).toBe(false)
    expect(S.analyticsScriptsLoaded).toBe(false)
    expect(S.pendingRecoveryEvent).toBeNull()
    expect(S.sessionEngaged).toBe(false)
    expect(S.userProperties).toEqual({})
    expect(S.userId).toBe('')
    expect(S.gtagMeasurementId).toBe(S.DEFAULT_GTAG_MEASUREMENT_ID)
    expect(S.umamiWebsiteId).toBe(S.DEFAULT_UMAMI_WEBSITE_ID)
    expect(S.realMeasurementId).toBe('')
  })
})

describe('setMeasurementId', () => {
  it('updates measurementId', () => {
    S.setMeasurementId('G-ABC123')
    expect(S.measurementId).toBe('G-ABC123')
  })
})

describe('setPageId', () => {
  it('updates pageId', () => {
    S.setPageId('/dashboard')
    expect(S.pageId).toBe('/dashboard')
  })
})

describe('replaceUserProperties', () => {
  it('replaces all user properties', () => {
    S.replaceUserProperties({ key: 'value' })
    expect(S.userProperties).toEqual({ key: 'value' })
  })

  it('overwrites existing properties entirely', () => {
    S.replaceUserProperties({ a: '1', b: '2' })
    S.replaceUserProperties({ c: '3' })
    expect(S.userProperties).toEqual({ c: '3' })
  })
})

describe('mergeUserProperties', () => {
  it('merges new properties into existing ones', () => {
    S.replaceUserProperties({ a: '1' })
    S.mergeUserProperties({ b: '2' })
    expect(S.userProperties).toEqual({ a: '1', b: '2' })
  })

  it('overwrites existing keys', () => {
    S.replaceUserProperties({ a: 'old' })
    S.mergeUserProperties({ a: 'new', b: 'extra' })
    expect(S.userProperties).toEqual({ a: 'new', b: 'extra' })
  })
})

describe('setUserId', () => {
  it('updates userId', () => {
    S.setUserId('u-999')
    expect(S.userId).toBe('u-999')
  })
})

describe('setInitialized', () => {
  it('sets initialized to true', () => {
    S.setInitialized(true)
    expect(S.initialized).toBe(true)
  })

  it('sets initialized to false', () => {
    S.setInitialized(true)
    S.setInitialized(false)
    expect(S.initialized).toBe(false)
  })
})

describe('setUserHasInteracted', () => {
  it('updates userHasInteracted', () => {
    S.setUserHasInteracted(true)
    expect(S.userHasInteracted).toBe(true)
  })
})

describe('setAnalyticsScriptsLoaded', () => {
  it('updates analyticsScriptsLoaded', () => {
    S.setAnalyticsScriptsLoaded(true)
    expect(S.analyticsScriptsLoaded).toBe(true)
  })
})

describe('S.setPendingRecoveryEvent / S.consumePendingRecoveryEvent', () => {
  it('sets and retrieves a pending recovery event', () => {
    const event = { type: 'error', payload: { msg: 'fail' } } as never
    S.setPendingRecoveryEvent(event)
    expect(S.pendingRecoveryEvent).toEqual(event)
  })

  it('consumePendingRecoveryEvent returns the event and clears it', () => {
    const event = { type: 'error', payload: { msg: 'fail' } } as never
    S.setPendingRecoveryEvent(event)
    const consumed = S.consumePendingRecoveryEvent()
    expect(consumed).toEqual(event)
    expect(S.pendingRecoveryEvent).toBeNull()
  })

  it('consumePendingRecoveryEvent returns null when nothing is pending', () => {
    expect(S.consumePendingRecoveryEvent()).toBeNull()
  })

  it('can set event to null', () => {
    const event = { type: 'error', payload: {} } as never
    S.setPendingRecoveryEvent(event)
    S.setPendingRecoveryEvent(null)
    expect(S.pendingRecoveryEvent).toBeNull()
  })
})

describe('setSessionEngaged', () => {
  it('updates sessionEngaged', () => {
    S.setSessionEngaged(true)
    expect(S.sessionEngaged).toBe(true)
  })
})

describe('setGtagMeasurementId', () => {
  it('updates gtagMeasurementId', () => {
    S.setGtagMeasurementId('G-CUSTOM')
    expect(S.gtagMeasurementId).toBe('G-CUSTOM')
  })
})

describe('setUmamiWebsiteId', () => {
  it('updates umamiWebsiteId', () => {
    S.setUmamiWebsiteId('new-uuid')
    expect(S.umamiWebsiteId).toBe('new-uuid')
  })
})

describe('setRealMeasurementId', () => {
  it('updates realMeasurementId', () => {
    S.setRealMeasurementId('G-REAL123')
    expect(S.realMeasurementId).toBe('G-REAL123')
  })
})
