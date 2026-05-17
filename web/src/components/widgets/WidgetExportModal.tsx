/**
 * Widget Export Modal
 *
 * Allows users to export dashboard cards as standalone desktop widgets
 * for Übersicht (macOS) and other platforms.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Download, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BACKEND_DEFAULT_URL } from '../../lib/constants'
import { emitWidgetDownloaded } from '../../lib/analytics'
import { BaseModal } from '../../lib/modals'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { generateWidget, getWidgetFilename, type WidgetConfig } from '../../lib/widgets/codeGenerator'
import { copyToClipboard } from '../../lib/clipboard'
import { safeRevokeObjectURL } from '../../lib/download'
import WidgetExportForm, { type ExportTab } from './WidgetExportForm'
import WidgetPreviewPanel from './WidgetPreviewPanel'

interface WidgetExportModalProps {
  isOpen: boolean
  onClose: () => void
  cardType?: string
  mode?: 'card' | 'stat' | 'template' | 'picker'
  embedded?: boolean
}

const EXPORT_TAB_IDS: Record<ExportTab, string> = {
  templates: 'widget-export-tab-templates',
  card: 'widget-export-tab-card',
  stats: 'widget-export-tab-stats',
}
const EXPORT_PANEL_IDS: Record<ExportTab, string> = {
  templates: 'widget-export-panel-templates',
  card: 'widget-export-panel-card',
  stats: 'widget-export-panel-stats',
}
const API_ENDPOINT_INPUT_ID = 'widget-export-api-endpoint'
const REFRESH_INTERVAL_INPUT_ID = 'widget-export-refresh-interval'
const WIDGET_CODE_PANEL_ID = 'widget-export-code-panel'
const MIN_REFRESH_INTERVAL_SECONDS = 10

export function WidgetExportModal({ isOpen, onClose, cardType, mode: _mode = 'picker', embedded = false }: WidgetExportModalProps) {
  const { t } = useTranslation('common')
  const [activeTab, setActiveTab] = useState<ExportTab>(cardType ? 'card' : 'templates')
  const [selectedCard, setSelectedCard] = useState<string | null>(cardType || null)
  const [selectedStats, setSelectedStats] = useState<string[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>('cluster_overview')
  const [apiEndpoint, setApiEndpoint] = useState(() => {
    const host = window.location.hostname
    if (host === 'console.kubestellar.io' || host.includes('netlify.app')) {
      return window.location.origin
    }
    return BACKEND_DEFAULT_URL
  })
  const [refreshInterval, setRefreshInterval] = useState(30)
  const [copied, setCopied] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [isLoading, setIsLoading] = useState(false)
  const isOnPublicSite = window.location.hostname === 'console.kubestellar.io' || window.location.hostname.includes('netlify')
  const cardListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  useEffect(() => {
    if (!cardType || activeTab !== 'card') return
    const SCROLL_DELAY_MS = 100
    const timer = setTimeout(() => {
      const element = cardListRef.current?.querySelector(`[data-widget-card="${cardType}"]`)
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, SCROLL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [cardType, activeTab])

  const exportConfig: WidgetConfig | null = (() => {
    if (activeTab === 'card' && selectedCard) {
      return {
        type: 'card',
        cardType: selectedCard,
        apiEndpoint,
        refreshInterval: refreshInterval * 1000,
        theme: 'dark',
      }
    }

    if (activeTab === 'stats' && selectedStats.length > 0) {
      return {
        type: 'stat',
        statIds: selectedStats,
        apiEndpoint,
        refreshInterval: refreshInterval * 1000,
        theme: 'dark',
      }
    }

    if (activeTab === 'templates' && selectedTemplate) {
      return {
        type: 'template',
        templateId: selectedTemplate,
        apiEndpoint,
        refreshInterval: refreshInterval * 1000,
        theme: 'dark',
      }
    }

    return null
  })()

  const widgetCode = useMemo(() => {
    if (!exportConfig) return ''
    try {
      return generateWidget(exportConfig)
    } catch (error: unknown) {
      return `// Error generating widget: ${error}`
    }
  }, [exportConfig])

  const filename = exportConfig ? getWidgetFilename(exportConfig) : 'widget.jsx'

  const handleDownload = () => {
    if (!widgetCode) return

    setIsLoading(true)
    const blob = new Blob([widgetCode], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    safeRevokeObjectURL(url)
    setIsLoading(false)
    emitWidgetDownloaded('uebersicht')
  }

  const handleCopy = async () => {
    if (!widgetCode) return
    await copyToClipboard(widgetCode)
    setCopied(true)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopied(false), UI_FEEDBACK_TIMEOUT_MS)
  }

  const toggleStat = (statId: string) => {
    setSelectedStats((prev) => (
      prev.includes(statId) ? prev.filter((selectedStat) => selectedStat !== statId) : [...prev, statId]
    ))
  }

  const widgetContent = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex border-b border-border mb-4" role="tablist" aria-label={t('widgets.exportDesktopWidget')}>
        <button
          onClick={() => setActiveTab('templates')}
          id={EXPORT_TAB_IDS.templates}
          role="tab"
          aria-selected={activeTab === 'templates'}
          aria-controls={EXPORT_PANEL_IDS.templates}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'templates'
              ? 'text-primary border-primary'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          }`}
        >
          {t('widgets.templates')}
        </button>
        <button
          onClick={() => setActiveTab('card')}
          id={EXPORT_TAB_IDS.card}
          role="tab"
          aria-selected={activeTab === 'card'}
          aria-controls={EXPORT_PANEL_IDS.card}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'card'
              ? 'text-primary border-primary'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          }`}
        >
          {t('widgets.singleCard')}
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          id={EXPORT_TAB_IDS.stats}
          role="tab"
          aria-selected={activeTab === 'stats'}
          aria-controls={EXPORT_PANEL_IDS.stats}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'stats'
              ? 'text-primary border-primary'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          }`}
        >
          {t('widgets.statBlocks')}
        </button>
      </div>

      <div className="flex-1 flex items-start gap-4 min-h-0">
        <WidgetExportForm
          activeTab={activeTab}
          selectedCard={selectedCard}
          onSelectCard={setSelectedCard}
          selectedStats={selectedStats}
          onToggleStat={toggleStat}
          selectedTemplate={selectedTemplate}
          onSelectTemplate={setSelectedTemplate}
          apiEndpoint={apiEndpoint}
          onApiEndpointChange={setApiEndpoint}
          refreshInterval={refreshInterval}
          onRefreshIntervalChange={setRefreshInterval}
          isOnPublicSite={isOnPublicSite}
          cardListRef={cardListRef}
          panelId={EXPORT_PANEL_IDS[activeTab]}
          labelledBy={EXPORT_TAB_IDS[activeTab]}
          apiEndpointInputId={API_ENDPOINT_INPUT_ID}
          refreshIntervalInputId={REFRESH_INTERVAL_INPUT_ID}
          minRefreshIntervalSeconds={MIN_REFRESH_INTERVAL_SECONDS}
        />

        <WidgetPreviewPanel
          config={exportConfig}
          widgetCode={widgetCode}
          showCode={showCode}
          onToggleCode={() => setShowCode((prev) => !prev)}
          widgetCodePanelId={WIDGET_CODE_PANEL_ID}
        />
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-border shrink-0">
        <a
          href="https://tracesof.net/uebersicht/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          {t('widgets.getUebersicht')} <ExternalLink className="w-3 h-3" />
        </a>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            disabled={!widgetCode}
            className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 rounded flex items-center gap-2 disabled:opacity-50"
            aria-label={copied ? t('widgets.copied', 'Copied!') : t('widgets.copyCode', 'Copy Code')}
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
          <button
            onClick={handleDownload}
            disabled={!widgetCode || isLoading}
            className="px-4 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 rounded flex items-center gap-2 disabled:opacity-50"
            aria-label={t('widgets.downloadFilename', { filename })}
          >
            <Download className="w-4 h-4" />
            {t('widgets.downloadFilename', { filename })}
          </button>
        </div>
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          {widgetContent}
        </div>
      </div>
    )
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <BaseModal.Header
        title={t('widgets.exportDesktopWidget')}
        icon={Download}
        onClose={onClose}
      />
      <BaseModal.Content>
        {widgetContent}
      </BaseModal.Content>
    </BaseModal>
  )
}

export default WidgetExportModal
