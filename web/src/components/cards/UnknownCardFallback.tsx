import { AlertTriangle } from 'lucide-react'

interface UnknownCardFallbackProps {
  cardType: string
}

/**
 * Fallback UI rendered when a card type is not registered in the card registry.
 * Shown instead of silently hiding the card so users know something is wrong
 * and can remove the problematic card.
 */
export function UnknownCardFallback({ cardType }: UnknownCardFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4">
      <AlertTriangle className="w-6 h-6 text-yellow-500" />
      <p className="text-sm font-medium">Unknown card type: {cardType}</p>
      <p className="text-xs">This card type is not registered. You can remove it.</p>
    </div>
  )
}
