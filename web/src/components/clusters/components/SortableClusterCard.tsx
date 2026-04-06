import { memo, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { CardWrapper } from '../../cards/CardWrapper'
import { CARD_COMPONENTS, getCardComponent, DEMO_DATA_CARDS } from '../../cards/cardRegistry'
import { UnknownCardFallback } from '../../cards/UnknownCardFallback'
import { DashboardCard } from '../../../lib/dashboards'
import { formatCardTitle } from '../../../lib/formatCardTitle'
import { useMobile } from '../../../hooks/useMobile'

export interface SortableClusterCardProps {
  card: DashboardCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
}

export const SortableClusterCard = memo(function SortableClusterCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
  isRefreshing,
  onRefresh,
  lastUpdated,
}: SortableClusterCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })

  const { isMobile } = useMobile()
  const cardWidth = card.position?.w || 4
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Only apply multi-column span on desktop; mobile uses single column
    gridColumn: isMobile ? 'span 1' : `span ${cardWidth}`,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]

  // Use getCardComponent() in an effect to trigger its centralised console.warn
  // when the type is unrecognised without causing a react-hooks/static-components
  // lint violation (getCardComponent retrieves, not creates, a component).
  useEffect(() => {
    getCardComponent(card.card_type)
  }, [card.card_type])

  return (
    <div ref={setNodeRef} style={style}>
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        title={formatCardTitle(card.card_type)}
        cardWidth={cardWidth}
        onConfigure={onConfigure}
        onRemove={onRemove}
        onWidthChange={onWidthChange}
        isDemoData={DEMO_DATA_CARDS.has(card.card_type)}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        lastUpdated={lastUpdated}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            className="p-1 rounded hover:bg-secondary cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        }
      >
        {CardComponent ? (
          <CardComponent config={card.config ?? {}} />
        ) : (
          <UnknownCardFallback cardType={card.card_type} />
        )}
      </CardWrapper>
    </div>
  )
})
