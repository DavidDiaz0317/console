import type React from 'react'
import { cn } from '@/lib/cn'

interface StatTileProps {
  icon: React.ReactNode
  label: string
  value: number | string
  colorClass: string
  borderClass: string
  /** Format the value with toLocaleString() (default: false) */
  formatValue?: boolean
}

export function StatTile({
  icon,
  label,
  value,
  colorClass,
  borderClass,
  formatValue = false,
}: StatTileProps) {
  const displayValue =
    formatValue && typeof value === 'number' ? value.toLocaleString() : value

  return (
    <div className={cn('p-3 rounded-lg bg-secondary/30 border', borderClass)}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className={cn('text-xs', colorClass)}>{label}</span>
      </div>
      <span className="text-2xl font-bold text-foreground">{displayValue}</span>
    </div>
  )
}
