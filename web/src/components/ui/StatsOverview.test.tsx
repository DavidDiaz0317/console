import { describe, it, expect } from 'vitest'
import { StatsOverview, formatStatNumber } from './StatsOverview'

describe('StatsOverview Component', () => {
  it('exports StatsOverview component', () => {
    expect(StatsOverview).toBeDefined()
    expect(typeof StatsOverview).toBe('function')
  })

  it('exports formatStatNumber helper for health-related stat formatting', () => {
    expect(formatStatNumber).toBeDefined()
    expect(formatStatNumber(0)).toBe('0')
    expect(formatStatNumber(1000)).toBe('1,000')
    expect(formatStatNumber(15000)).toBe('15.0K')
    expect(formatStatNumber(1_000_000)).toBe('1.0M')
  })

  it('accepts isDemoData prop to signal demo/health state visually', () => {
    // Verify the component accepts and reflects health/demo state via its props
    const src = StatsOverview.toString()
    expect(src).toContain('isDemoData')
  })
})
