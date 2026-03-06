import { useMemo, useCallback, useRef, useEffect, useReducer } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type PaginationState = { currentPage: number; itemsPerPage: number }
type PaginationAction =
  | { type: 'SET_PER_PAGE'; perPage: number }
  | { type: 'GO_TO_PAGE'; page: number }
  | { type: 'RESET_BOTH'; itemsPerPage: number }
  | { type: 'CLAMP_PAGE'; maxPage: number }

function paginationReducer(state: PaginationState, action: PaginationAction): PaginationState {
  switch (action.type) {
    case 'SET_PER_PAGE':
      // Batch itemsPerPage + currentPage reset into a single atomic update
      return { itemsPerPage: action.perPage, currentPage: 1 }
    case 'GO_TO_PAGE':
      return { ...state, currentPage: action.page }
    case 'RESET_BOTH':
      // Batch itemsPerPage sync + currentPage reset into a single atomic update
      return { itemsPerPage: action.itemsPerPage, currentPage: 1 }
    case 'CLAMP_PAGE':
      return { ...state, currentPage: action.maxPage }
    default:
      return state
  }
}

// Hook for managing pagination state
export function usePagination<T>(items: T[], defaultPerPage: number = 5, resetOnFilterChange: boolean = true) {
  const [state, dispatch] = useReducer(paginationReducer, {
    currentPage: 1,
    itemsPerPage: defaultPerPage,
  })
  const prevDefaultPerPage = useRef(defaultPerPage)
  const prevItemsLength = useRef(items.length)

  // Update itemsPerPage when defaultPerPage changes (e.g., when user selects "Show All")
  useEffect(() => {
    if (prevDefaultPerPage.current !== defaultPerPage) {
      prevDefaultPerPage.current = defaultPerPage
      dispatch({ type: 'RESET_BOTH', itemsPerPage: defaultPerPage })
    }
  }, [defaultPerPage])

  // Reset to page 1 when filter changes (items count changes)
  useEffect(() => {
    if (resetOnFilterChange && prevItemsLength.current !== items.length) {
      if (state.currentPage > 1) {
        dispatch({ type: 'GO_TO_PAGE', page: 1 })
      }
      prevItemsLength.current = items.length
    }
  }, [items.length, resetOnFilterChange, state.currentPage])

  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / state.itemsPerPage))

  // Derive safe page without setState during render (avoids React anti-pattern)
  const safePage = Math.min(state.currentPage, totalPages)

  // Sync currentPage back when out of bounds, but via effect not during render
  useEffect(() => {
    if (state.currentPage > totalPages && totalPages > 0) {
      dispatch({ type: 'CLAMP_PAGE', maxPage: totalPages })
    }
  }, [state.currentPage, totalPages])

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * state.itemsPerPage
    return items.slice(start, start + state.itemsPerPage)
  }, [items, safePage, state.itemsPerPage])

  // Use ref to avoid stale totalPages in goToPage callback
  const totalPagesRef = useRef(totalPages)
  totalPagesRef.current = totalPages

  const goToPage = useCallback((page: number) => {
    dispatch({ type: 'GO_TO_PAGE', page: Math.max(1, Math.min(page, totalPagesRef.current)) })
  }, [])

  const setPerPage = useCallback((perPage: number) => {
    dispatch({ type: 'SET_PER_PAGE', perPage })
  }, [])

  return {
    paginatedItems,
    currentPage: safePage,
    totalPages,
    totalItems,
    itemsPerPage: state.itemsPerPage,
    goToPage,
    setPerPage,
    // Convenience: whether pagination is needed
    needsPagination: totalItems > state.itemsPerPage,
  }
}

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onItemsPerPageChange?: (perPage: number) => void
  className?: string
  showItemsPerPage?: boolean
  itemsPerPageOptions?: number[]
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  className = '',
  showItemsPerPage = true,
  itemsPerPageOptions = [5, 10, 20, 50],
}: PaginationProps) {
  const { t } = useTranslation('common')
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  const canGoPrevious = currentPage > 1
  const canGoNext = currentPage < totalPages

  return (
    <div className={`flex items-center justify-between text-sm ${className}`}>
      {/* Items info */}
      <div className="text-muted-foreground">
        {totalItems > 0 ? (
          <span>
            {t('pagination.showing', { start: startItem, end: endItem, total: totalItems })}
          </span>
        ) : (
          <span>{t('pagination.noItems')}</span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {/* Items per page selector */}
        {showItemsPerPage && onItemsPerPageChange && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('pagination.perPage')}</span>
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="px-2 py-1 rounded bg-secondary border border-border text-foreground text-sm"
            >
              {itemsPerPageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={!canGoPrevious}
            className="p-1.5 rounded hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
            title={t('pagination.firstPage')}
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!canGoPrevious}
            className="p-1.5 rounded hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
            title={t('pagination.previousPage')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="px-3 py-1 text-foreground">
            {currentPage} / {totalPages || 1}
          </span>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!canGoNext}
            className="p-1.5 rounded hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
            title={t('pagination.nextPage')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={!canGoNext}
            className="p-1.5 rounded hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
            title={t('pagination.lastPage')}
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
