import { useNavigate } from 'react-router-dom'
import { useDashboardContext } from '@/hooks/useDashboardContext'
import type { CardHistoryEntry } from '@/hooks/useCardHistory'
import { ROUTES } from '@/config/routes'
import { safeLazy } from '@/lib/safeLazy'

const CardHistory = safeLazy(() => import('@/components/history/CardHistory'), 'CardHistory')

// Wrapper for CardHistory that provides the restore functionality
export function CardHistoryWithRestore() {
  const navigate = useNavigate()
  const { setPendingRestoreCard } = useDashboardContext()

  const handleRestoreCard = (entry: CardHistoryEntry) => {
    // Set the card to be restored in context
    setPendingRestoreCard({
      cardType: entry.cardType,
      cardTitle: entry.cardTitle,
      config: entry.config,
      dashboardId: entry.dashboardId,
    })
    // Navigate to the dashboard
    navigate(ROUTES.HOME)
  }

  return <CardHistory onRestoreCard={handleRestoreCard} />
}
