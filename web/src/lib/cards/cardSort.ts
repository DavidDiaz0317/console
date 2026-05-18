import { useState, useMemo } from 'react'
import type { SortConfig, SortDirection } from './cardFilters'

// ============================================================================
// useCardSort - Generic sorting hook
// ============================================================================

export interface UseCardSortResult<T, S extends string> {
  /** Sorted items */
  sorted: T[]
  /** Current sort field */
  sortBy: S
  /** Set sort field */
  setSortBy: (field: S) => void
  /** Current sort direction */
  sortDirection: SortDirection
  /** Set sort direction */
  setSortDirection: (dir: SortDirection) => void
  /** Toggle sort direction */
  toggleSortDirection: () => void
}

export function useCardSort<T, S extends string>(
  items: T[],
  config: SortConfig<T, S>
): UseCardSortResult<T, S> {
  // Guard against undefined config — dynamic/custom cards may pass undefined at runtime
  const safeConfig = config ?? ({} as SortConfig<T, S>)
  const { defaultField, defaultDirection, comparators } = safeConfig
  const [sortBy, setSortBy] = useState<S>(defaultField)
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection ?? 'asc')

  const toggleSortDirection = () => {
    setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
  }

  const sorted = useMemo(() => {
    const comparator = comparators?.[sortBy]
    if (!comparator) return [...(items || [])]

    return [...(items || [])].sort((a, b) => {
      const result = comparator(a, b)
      return sortDirection === 'asc' ? result : -result
    })
  }, [items, comparators, sortBy, sortDirection])

  return {
    sorted,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    toggleSortDirection }
}

// ============================================================================
// Common comparators for reuse
// ============================================================================

export const commonComparators = {
  /** Compare strings alphabetically */
  string: <T>(field: keyof T) => (a: T, b: T) => {
    const aVal = String(a[field] || '')
    const bVal = String(b[field] || '')
    return aVal.localeCompare(bVal)
  },

  /** Compare numbers */
  number: <T>(field: keyof T) => (a: T, b: T) => {
    const aVal = Number(a[field]) || 0
    const bVal = Number(b[field]) || 0
    return aVal - bVal
  },

  /** Compare by status order (for priority sorting) */
  statusOrder: <T>(field: keyof T, order: Record<string, number>) => (a: T, b: T) => {
    const aStatus = String(a[field] || '')
    const bStatus = String(b[field] || '')
    return (order[aStatus] ?? 999) - (order[bStatus] ?? 999)
  },

  /** Compare dates (ISO strings or Date objects).
   * Invalid dates (NaN) are sorted to the END of the list in ascending order
   * so valid, chronological data stays front-loaded. We use
   * Number.MAX_SAFE_INTEGER as the sentinel rather than 0 so that legitimate
   * epoch-zero timestamps still sort before invalid values. */
  date: <T>(field: keyof T) => (a: T, b: T) => {
    const INVALID_DATE_SENTINEL = Number.MAX_SAFE_INTEGER
    const aRaw = new Date(a[field] as string | Date).getTime()
    const bRaw = new Date(b[field] as string | Date).getTime()
    const aDate = Number.isNaN(aRaw) ? INVALID_DATE_SENTINEL : aRaw
    const bDate = Number.isNaN(bRaw) ? INVALID_DATE_SENTINEL : bRaw
    return aDate - bDate
  } }
