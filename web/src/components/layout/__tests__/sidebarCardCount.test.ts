import { describe, expect, it } from 'vitest'
import { getSidebarCardCount, getSidebarHrefCardCount } from '../sidebarCardCount'
import { aiAgentsDashboardConfig } from '../../../config/dashboards/ai-agents'
import { alertsDashboardConfig } from '../../../config/dashboards/alerts'
import { mainDashboardConfig } from '../../../config/dashboards/main'

describe('getSidebarCardCount', () => {
  it('uses direct dashboard cards when present', () => {
    expect(getSidebarCardCount(mainDashboardConfig)).toBe(mainDashboardConfig.cards.length)
  })

  it('falls back to the first tab card count for tabbed dashboards', () => {
    expect(getSidebarCardCount(aiAgentsDashboardConfig)).toBe(aiAgentsDashboardConfig.tabs?.[0]?.cards.length)
  })

  it('returns null when the dashboard config is missing', () => {
    expect(getSidebarCardCount(undefined)).toBeNull()
  })
})

describe('getSidebarHrefCardCount', () => {
  it('returns the alerts dashboard card count for the alerts sidebar entry', () => {
    expect(getSidebarHrefCardCount('/alerts')).toBe(alertsDashboardConfig.cards.length)
  })

  it('returns null for sidebar entries without a dashboard config', () => {
    expect(getSidebarHrefCardCount('/does-not-exist')).toBeNull()
  })
})
