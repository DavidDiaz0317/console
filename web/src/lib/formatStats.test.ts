import { describe, it, expect } from 'vitest'
import {
  formatStat,
  formatStatIfAvailable,
  formatMemoryStat,
  formatStorageStat,
  formatPercentStat,
} from './formatStats'

describe('formatStat', () => {
  it('returns "-" for undefined', () => {
    expect(formatStat(undefined)).toBe('-')
  })

  it('returns "-" for null', () => {
    expect(formatStat(null)).toBe('-')
  })

  it('formats zero as "0"', () => {
    expect(formatStat(0)).toBe('0')
  })

  it('returns "-" for zero when dashOnZero is true', () => {
    expect(formatStat(0, { dashOnZero: true })).toBe('-')
  })

  it('formats small numbers as-is', () => {
    expect(formatStat(42)).toBe('42')
    expect(formatStat(999)).toBe('999')
  })

  it('auto-scales numbers >= 10000 to K', () => {
    expect(formatStat(10000)).toBe('10.0K')
    expect(formatStat(15000)).toBe('15.0K')
  })

  it('auto-scales numbers >= 1000000 to M', () => {
    expect(formatStat(1_000_000)).toBe('1.0M')
    expect(formatStat(2_500_000)).toBe('2.5M')
  })

  it('never shows negative numbers', () => {
    expect(formatStat(-5)).toBe('0')
    expect(formatStat(-1000)).toBe('0')
  })

  it('appends suffix', () => {
    expect(formatStat(42, { suffix: '%' })).toBe('42%')
  })

  it('uses custom formatter', () => {
    expect(formatStat(1024, { formatter: (n) => `${n} GB` })).toBe('1024 GB')
  })
})

describe('formatStatIfAvailable', () => {
  it('returns "-" when hasData is false', () => {
    expect(formatStatIfAvailable(100, false)).toBe('-')
  })

  it('formats value when hasData is true', () => {
    expect(formatStatIfAvailable(100, true)).toBe('100')
  })

  it('returns "-" for undefined value even with hasData=true', () => {
    expect(formatStatIfAvailable(undefined, true)).toBe('-')
  })
})

describe('formatMemoryStat', () => {
  it('returns "-" when hasData is false', () => {
    expect(formatMemoryStat(100, false)).toBe('-')
  })

  it('returns "-" for undefined', () => {
    expect(formatMemoryStat(undefined)).toBe('-')
  })

  it('returns "-" for null', () => {
    expect(formatMemoryStat(null)).toBe('-')
  })

  it('formats 0 as "0 GB"', () => {
    expect(formatMemoryStat(0)).toBe('0 GB')
  })

  it('formats values >= 1 GB as "X GB"', () => {
    expect(formatMemoryStat(1)).toBe('1 GB')
    expect(formatMemoryStat(16)).toBe('16 GB')
    expect(formatMemoryStat(512)).toBe('512 GB')
  })

  it('formats values < 0.001 GB as "0 GB"', () => {
    expect(formatMemoryStat(0.0001)).toBe('0 GB')
  })

  it('formats values in MB range (0.001 to < 1 GB)', () => {
    expect(formatMemoryStat(0.5)).toBe('512 MB')
    expect(formatMemoryStat(0.25)).toBe('256 MB')
  })

  it('formats values >= 1024 GB as TB', () => {
    expect(formatMemoryStat(1024)).toBe('1.0 TB')
    expect(formatMemoryStat(14745.6)).toBe('14.4 TB')
  })

  it('formats values >= 1024 * 1024 GB as PB', () => {
    expect(formatMemoryStat(1024 * 1024)).toBe('1.0 PB')
  })

  it('never shows negative values', () => {
    expect(formatMemoryStat(-100)).toBe('0 GB')
  })
})

describe('formatStorageStat', () => {
  it('delegates to formatMemoryStat', () => {
    expect(formatStorageStat(1024)).toBe('1.0 TB')
    expect(formatStorageStat(undefined)).toBe('-')
    expect(formatStorageStat(null)).toBe('-')
    expect(formatStorageStat(16, false)).toBe('-')
  })
})

describe('formatPercentStat', () => {
  it('returns "-" when hasData is false', () => {
    expect(formatPercentStat(50, false)).toBe('-')
  })

  it('returns "-" for undefined', () => {
    expect(formatPercentStat(undefined)).toBe('-')
  })

  it('returns "-" for null', () => {
    expect(formatPercentStat(null)).toBe('-')
  })

  it('formats percentage values', () => {
    expect(formatPercentStat(0)).toBe('0%')
    expect(formatPercentStat(50)).toBe('50%')
    expect(formatPercentStat(100)).toBe('100%')
  })

  it('clamps values to 0-100', () => {
    expect(formatPercentStat(-10)).toBe('0%')
    expect(formatPercentStat(150)).toBe('100%')
  })
})
