import type { RefObject } from 'react'
import { AlertTriangle, Check, Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  WIDGET_CARDS,
  WIDGET_STATS,
  WIDGET_TEMPLATES,
  type WidgetCardDefinition,
  type WidgetStatDefinition,
  type WidgetTemplateDefinition,
} from '../../lib/widgets/widgetRegistry'

export type ExportTab = 'card' | 'stats' | 'templates'

interface WidgetExportFormProps {
  activeTab: ExportTab
  selectedCard: string | null
  onSelectCard: (cardType: string) => void
  selectedStats: string[]
  onToggleStat: (statId: string) => void
  selectedTemplate: string | null
  onSelectTemplate: (templateId: string) => void
  apiEndpoint: string
  onApiEndpointChange: (value: string) => void
  refreshInterval: number
  onRefreshIntervalChange: (value: number) => void
  isOnPublicSite: boolean
  cardListRef: RefObject<HTMLDivElement | null>
  panelId: string
  labelledBy: string
  apiEndpointInputId: string
  refreshIntervalInputId: string
  minRefreshIntervalSeconds: number
}

export function WidgetExportForm({
  activeTab,
  selectedCard,
  onSelectCard,
  selectedStats,
  onToggleStat,
  selectedTemplate,
  onSelectTemplate,
  apiEndpoint,
  onApiEndpointChange,
  refreshInterval,
  onRefreshIntervalChange,
  isOnPublicSite,
  cardListRef,
  panelId,
  labelledBy,
  apiEndpointInputId,
  refreshIntervalInputId,
  minRefreshIntervalSeconds,
}: WidgetExportFormProps) {
  const { t } = useTranslation('common')

  return (
    <div className="w-1/2 flex flex-col overflow-hidden min-h-0">
      <div
        id={panelId}
        ref={cardListRef}
        className="flex-1 overflow-y-auto pr-2"
        role="tabpanel"
        aria-labelledby={labelledBy}
      >
        {activeTab === 'templates' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">
              Pre-built widget layouts combining multiple cards
            </p>
            {Object.values(WIDGET_TEMPLATES).map((template) => (
              <TemplateCard
                key={template.templateId}
                template={template}
                selected={selectedTemplate === template.templateId}
                onSelect={() => onSelectTemplate(template.templateId)}
              />
            ))}
          </div>
        )}

        {activeTab === 'card' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">
              Export a single card as a standalone widget
            </p>
            {Object.values(WIDGET_CARDS).map((card) => (
              <CardItem
                key={card.cardType}
                card={card}
                selected={selectedCard === card.cardType}
                onSelect={() => onSelectCard(card.cardType)}
              />
            ))}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">
              Select stats to include in your widget (select multiple)
            </p>
            {Object.values(WIDGET_STATS).map((stat) => (
              <StatItem
                key={stat.statId}
                stat={stat}
                selected={selectedStats.includes(stat.statId)}
                onToggle={() => onToggleStat(stat.statId)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-border space-y-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label htmlFor={apiEndpointInputId} className="block text-xs text-muted-foreground">{t('widgets.apiEndpoint')}</label>
            <div className="relative group">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 rounded-lg bg-card border border-border shadow-xl text-xs text-muted-foreground opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-dropdown">
                Widgets require a locally installed or cluster-deployed Console. The API endpoint must match your deployment.
                {isOnPublicSite && (
                  <a
                    href="https://docs.kubestellar.io/stable/Getting-Started/quickstart/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mt-1.5 text-primary hover:underline"
                  >
                    Install your Console now →
                  </a>
                )}
              </div>
            </div>
          </div>
          <input
            id={apiEndpointInputId}
            type="text"
            value={apiEndpoint}
            onChange={(event) => onApiEndpointChange(event.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-secondary rounded border border-border focus:border-purple-500 focus:outline-hidden"
          />
          {isOnPublicSite && (
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-yellow-400">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>
                You're on console.kubestellar.io —{' '}
                <a
                  href="https://docs.kubestellar.io/stable/Getting-Started/quickstart/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-yellow-300"
                >
                  install your Console locally
                </a>
                {' '}for widgets to work.
              </span>
            </div>
          )}
        </div>
        <div>
          <label htmlFor={refreshIntervalInputId} className="block text-xs text-muted-foreground mb-1">
            {t('widgets.refreshInterval')}
          </label>
          <input
            id={refreshIntervalInputId}
            type="number"
            value={refreshInterval}
            onChange={(event) => onRefreshIntervalChange(Math.max(minRefreshIntervalSeconds, Number.parseInt(event.target.value, 10) || 30))}
            min={minRefreshIntervalSeconds}
            className="w-24 px-3 py-1.5 text-sm bg-secondary rounded border border-border focus:border-purple-500 focus:outline-hidden"
          />
        </div>
      </div>
    </div>
  )
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: WidgetTemplateDefinition
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        selected
          ? 'bg-purple-500/20 border-purple-500/50'
          : 'bg-secondary/50 border-border hover:border-purple-500/30'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Monitor className="w-4 h-4 text-purple-400" />
        <span className="font-medium text-sm">{template.displayName}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
      <div className="flex flex-wrap gap-1">
        {template.cards.map((cardId) => (
          <span key={cardId} className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-2xs rounded">
            {cardId.replace(/_/g, ' ')}
          </span>
        ))}
        {template.stats?.map((statId) => (
          <span key={statId} className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-2xs rounded">
            {statId.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
      <div className="mt-2 text-2xs text-muted-foreground">
        {template.size.width}×{template.size.height}px • {template.layout} layout
      </div>
    </button>
  )
}

function CardItem({
  card,
  selected,
  onSelect,
}: {
  card: WidgetCardDefinition
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      data-widget-card={card.cardType}
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        selected
          ? 'bg-purple-500/20 border-purple-500/50'
          : 'bg-secondary/50 border-border hover:border-purple-500/30'
      }`}
    >
      <div className="font-medium text-sm">{card.displayName}</div>
      <p className="text-xs text-muted-foreground">{card.description}</p>
      <div className="mt-1 text-2xs text-muted-foreground">
        {card.defaultSize.width}×{card.defaultSize.height}px • {card.category}
      </div>
    </button>
  )
}

function StatItem({
  stat,
  selected,
  onToggle,
}: {
  stat: WidgetStatDefinition
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={selected}
      className={`w-full text-left p-2 rounded-lg border transition-colors flex items-center gap-3 ${
        selected
          ? 'bg-purple-500/20 border-purple-500/50'
          : 'bg-secondary/50 border-border hover:border-purple-500/30'
      }`}
    >
      <div
        className="w-8 h-8 rounded flex items-center justify-center text-lg font-bold"
        style={{ backgroundColor: `${stat.color}20`, color: stat.color }}
      >
        #
      </div>
      <div>
        <div className="font-medium text-sm">{stat.displayName}</div>
        <div className="text-2xs text-muted-foreground">
          {stat.format} • {stat.size.width}×{stat.size.height}px
        </div>
      </div>
      <div
        className={`ml-auto w-5 h-5 rounded border-2 flex items-center justify-center ${
          selected ? 'bg-purple-500 border-purple-500' : 'border-muted-foreground'
        }`}
      >
        {selected && <Check className="w-3 h-3 text-white" />}
      </div>
    </button>
  )
}

export default WidgetExportForm
