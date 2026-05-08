import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Settings, Hash, TrendingUp, CircleDot, BarChart3, ArrowUpDown, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import type { StatDisplayMode } from './StatsBlockDefinitions'
import { useModalState } from '../../lib/modals'

/** Gap between trigger button and popover in pixels */
const POPOVER_GAP_PX = 4
/** Fixed popover width in pixels */
const POPOVER_WIDTH_PX = 160
/** Minimum viewport margin for the popover in pixels */
const VIEWPORT_MARGIN_PX = 8

/** Gauge icon — custom SVG since Lucide doesn't have a half-arc gauge */
function GaugeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 16.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" opacity="0" />
      <path d="M5.63 7.63A7 7 0 0 1 19 12" />
      <path d="M12 12l-2.5-4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Horseshoe icon — U-shaped arc */
function HorseshoeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 8a7 7 0 0 1 14 0v5" />
      <path d="M5 8v5" />
    </svg>
  )
}

/** Heatmap icon — grid of squares */
function HeatmapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="3" width="7" height="7" rx="1" opacity="0.3" />
      <rect x="14" y="3" width="7" height="7" rx="1" opacity="0.6" />
      <rect x="3" y="14" width="7" height="7" rx="1" opacity="0.8" />
      <rect x="14" y="14" width="7" height="7" rx="1" opacity="1" />
    </svg>
  )
}

const MODE_OPTIONS: { mode: StatDisplayMode; icon: React.ComponentType<{ className?: string }>; labelKey: string }[] = [
  { mode: 'numeric', icon: Hash, labelKey: 'statBlockModePicker.number' },
  { mode: 'sparkline', icon: TrendingUp, labelKey: 'statBlockModePicker.sparkline' },
  { mode: 'gauge', icon: GaugeIcon, labelKey: 'statBlockModePicker.gauge' },
  { mode: 'horseshoe', icon: HorseshoeIcon, labelKey: 'statBlockModePicker.horseshoe' },
  { mode: 'ring-3', icon: CircleDot, labelKey: 'statBlockModePicker.ring' },
  { mode: 'mini-bar', icon: BarChart3, labelKey: 'statBlockModePicker.bar' },
  { mode: 'trend', icon: ArrowUpDown, labelKey: 'statBlockModePicker.trend' },
  { mode: 'stacked-bar', icon: Layers, labelKey: 'statBlockModePicker.stacked' },
  { mode: 'heatmap', icon: HeatmapIcon, labelKey: 'statBlockModePicker.heatmap' },
]

interface StatBlockModePickerProps {
  currentMode: StatDisplayMode
  availableModes: StatDisplayMode[]
  onModeChange: (mode: StatDisplayMode) => void
}

export function StatBlockModePicker({ currentMode, availableModes, onModeChange }: StatBlockModePickerProps) {
  const { t } = useTranslation()
  const { isOpen, close, toggle } = useModalState()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: VIEWPORT_MARGIN_PX })

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const maxLeft = Math.max(window.innerWidth - POPOVER_WIDTH_PX - VIEWPORT_MARGIN_PX, VIEWPORT_MARGIN_PX)
    const rightAlignedLeft = rect.right - POPOVER_WIDTH_PX
    setPosition({
      top: rect.bottom + POPOVER_GAP_PX,
      left: Math.min(Math.max(rightAlignedLeft, VIEWPORT_MARGIN_PX), maxLeft),
    })
  }, [])

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isOpen) updatePosition()
    toggle()
  }

  const handleSelect = (e: React.MouseEvent, mode: StatDisplayMode) => {
    e.stopPropagation()
    e.preventDefault()
    onModeChange(mode)
    close()
  }

  // Keep the portal aligned with its trigger while the layout changes.
  useEffect(() => {
    if (!isOpen) return

    updatePosition()

    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        close()
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const handleViewportChange = () => {
      updatePosition()
    }

    const resizeObserver = typeof ResizeObserver !== 'undefined' && triggerRef.current
      ? new ResizeObserver(() => {
          updatePosition()
        })
      : null

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    if (resizeObserver && triggerRef.current) {
      resizeObserver.observe(triggerRef.current)
    }

    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
      resizeObserver?.disconnect()
    }
  }, [isOpen, close, updatePosition])

  const availableSet = new Set(availableModes)

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        icon={<Settings className="w-3 h-3" />}
        onClick={handleToggle}
        title={t('statBlockModePicker.changeDisplayMode')}
        className="absolute top-1.5 right-1.5 p-1 opacity-0 group-hover:opacity-100 transition-all z-10"
      />
      {isOpen && createPortal(
        <div
          ref={popoverRef}
          role="menu"
          aria-label={t('statBlockModePicker.displayMode')}
          className="fixed z-dropdown bg-card border border-border rounded-lg shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-150"
          style={{ top: position.top, left: position.left, width: POPOVER_WIDTH_PX }}
        >
          <div className="text-2xs text-muted-foreground px-2 py-1 font-medium uppercase tracking-wider">
            {t('statBlockModePicker.displayMode')}
          </div>
          {MODE_OPTIONS.map(({ mode, icon: Icon, labelKey }) => {
            const isAvailable = availableSet.has(mode)
            const isActive = mode === currentMode
            return (
              <button
                key={mode}
                role="menuitem"
                onClick={(e) => isAvailable && handleSelect(e, mode)}
                disabled={!isAvailable}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-xs transition-colors ${
                  isActive
                    ? 'bg-purple-500/20 text-purple-400'
                    : isAvailable
                      ? 'text-foreground hover:bg-secondary'
                      : 'text-muted-foreground/40 cursor-not-allowed'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{t(labelKey)}</span>
                {isActive && <span className="ml-auto text-purple-400">&#x2713;</span>}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
