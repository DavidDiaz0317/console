// Barrel re-export — all public API is preserved so existing imports continue to work.
// Implementation has been split into focused modules:
//   cardFilters.ts  — useCardFilters + variant filter hooks + shared types
//   cardSort.ts     — useCardSort + commonComparators
//   cardData.ts     — useCardData (composes filters + sort)
//   cardCollapse.ts — useCardCollapse + useCardCollapseAll + pub/sub
//   cardFlash.ts    — useCardFlash

export type {
  ClusterWithHealth,
  SortDirection,
  SortOption,
  FilterConfig,
  SortConfig,
  CardDataConfig,
  UseCardFiltersResult,
  SingleSelectConfig,
  UseSingleSelectResult,
  ChartFilterConfig,
  UseChartFiltersResult,
  CascadingSelectionConfig,
  UseCascadingSelectionResult,
  StatusFilterConfig,
  UseStatusFilterResult,
} from './cardFilters'

export {
  useCardFilters,
  useSingleSelectCluster,
  useChartFilters,
  useCascadingSelection,
  useStatusFilter,
} from './cardFilters'

export type { UseCardSortResult } from './cardSort'
export { useCardSort, commonComparators } from './cardSort'

export type { UseCardDataResult } from './cardData'
export { useCardData } from './cardData'

export type { UseCardCollapseResult } from './cardCollapse'
export { useCardCollapse, useCardCollapseAll } from './cardCollapse'

export type { CardFlashType, UseCardFlashOptions, UseCardFlashResult } from './cardFlash'
export { useCardFlash } from './cardFlash'
