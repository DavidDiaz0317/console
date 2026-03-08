import { useState, useCallback } from 'react'

// ============================================================================
// useCardCollapse - Manage card collapsed state with persistence
// ============================================================================

const COLLAPSED_STORAGE_KEY = 'kubestellar-collapsed-cards'

/**
 * Get all collapsed card IDs from localStorage
 */
function getCollapsedCards(): Set<string> {
  try {
    const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

/**
 * Save collapsed card IDs to localStorage
 */
function saveCollapsedCards(collapsed: Set<string>) {
  localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsed]))
}

export interface UseCardCollapseResult {
  /** Whether the card is collapsed */
  isCollapsed: boolean
  /** Toggle collapsed state */
  toggleCollapsed: () => void
  /** Set collapsed state explicitly */
  setCollapsed: (collapsed: boolean) => void
  /** Expand the card (shorthand for setCollapsed(false)) */
  expand: () => void
  /** Collapse the card (shorthand for setCollapsed(true)) */
  collapse: () => void
}

/**
 * Hook to manage card collapse state with localStorage persistence.
 * Each card remembers its collapsed state across page reloads.
 *
 * @param cardId - Unique identifier for the card
 * @param defaultCollapsed - Default collapsed state (defaults to false = expanded)
 */
export function useCardCollapse(
  cardId: string,
  defaultCollapsed: boolean = false
): UseCardCollapseResult {
  const [isCollapsed, setIsCollapsedState] = useState(() => {
    const collapsed = getCollapsedCards()
    return collapsed.has(cardId) || defaultCollapsed
  })

  const setCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsedState(collapsed)
    const collapsedCards = getCollapsedCards()
    if (collapsed) {
      collapsedCards.add(cardId)
    } else {
      collapsedCards.delete(cardId)
    }
    saveCollapsedCards(collapsedCards)
  }, [cardId])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!isCollapsed)
  }, [isCollapsed, setCollapsed])

  const expand = useCallback(() => setCollapsed(false), [setCollapsed])
  const collapse = useCallback(() => setCollapsed(true), [setCollapsed])

  return {
    isCollapsed,
    toggleCollapsed,
    setCollapsed,
    expand,
    collapse,
  }
}

/**
 * Hook to manage collapse state for multiple cards at once.
 * Useful for "collapse all" / "expand all" functionality.
 */
export function useCardCollapseAll(cardIds: string[]) {
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(() => getCollapsedCards())

  const collapseAll = useCallback(() => {
    const newSet = new Set([...collapsedSet, ...cardIds])
    setCollapsedSet(newSet)
    saveCollapsedCards(newSet)
  }, [cardIds, collapsedSet])

  const expandAll = useCallback(() => {
    const newSet = new Set([...collapsedSet].filter(id => !cardIds.includes(id)))
    setCollapsedSet(newSet)
    saveCollapsedCards(newSet)
  }, [cardIds, collapsedSet])

  const isCardCollapsed = useCallback((cardId: string) => {
    return collapsedSet.has(cardId)
  }, [collapsedSet])

  const toggleCard = useCallback((cardId: string) => {
    const newSet = new Set(collapsedSet)
    if (newSet.has(cardId)) {
      newSet.delete(cardId)
    } else {
      newSet.add(cardId)
    }
    setCollapsedSet(newSet)
    saveCollapsedCards(newSet)
  }, [collapsedSet])

  const allCollapsed = cardIds.every(id => collapsedSet.has(id))
  const allExpanded = cardIds.every(id => !collapsedSet.has(id))

  return {
    collapseAll,
    expandAll,
    isCardCollapsed,
    toggleCard,
    allCollapsed,
    allExpanded,
    collapsedCount: cardIds.filter(id => collapsedSet.has(id)).length,
  }
}
