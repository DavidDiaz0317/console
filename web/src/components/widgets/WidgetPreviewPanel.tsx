import { useMemo, type CSSProperties } from 'react'
import { Info, Smartphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WIDGET_CARDS, WIDGET_STATS, WIDGET_TEMPLATES, type WidgetCardDefinition } from '../../lib/widgets/widgetRegistry'
import type { WidgetConfig } from '../../lib/widgets/codeGenerator'

interface WidgetPreviewPanelProps {
  config: WidgetConfig | null
  widgetCode: string
  showCode: boolean
  onToggleCode: () => void
  widgetCodePanelId: string
}

const WIDGET_EXPORT_MODAL_PREVIEW_MAX_WIDTH_PX = 260
const WIDGET_EXPORT_MODAL_PREVIEW_MAX_HEIGHT_PX = 220
const WIDGET_EXPORT_MODAL_DIV_STYLE_2: CSSProperties = { flex: 1 }
const WIDGET_EXPORT_MODAL_SPAN_STYLE_1: CSSProperties = {
  fontWeight: 500,
  maxWidth: '110px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const WIDGET_EXPORT_MODAL_SPAN_STYLE_2: CSSProperties = { fontWeight: 500 }
const WIDGET_EXPORT_MODAL_SPAN_STYLE_3: CSSProperties = { fontWeight: 500, flex: 1 }
const WIDGET_EXPORT_MODAL_SPAN_STYLE_4: CSSProperties = { width: '24px', fontWeight: 600, color: '#94a3b8' }

const PREV_XS = '4px'
const PREV_SM = '8px'
const PREV_MD = '12px'
const PREV_LG = '16px'
const PREV_ITEM_PAD = '4px 8px'
const PREV_CARD_PAD = '8px 12px'
const PREV_DOTS_GAP = '2px'
const PREV_BAR_GAP = '3px'
const PREV_HAIRLINE_GAP = '1px'
const PREV_FS_HERO = '28px'
const PREV_FS_HEADLINE = '24px'
const PREV_FS_FEATURED = '20px'
const PREV_FS_STAT = '16px'
const PREV_FS_STAT_SM = '14px'
const PREV_FS_BODY = '12px'
const PREV_FS_CAPTION = '10px'
const PREV_FS_MICRO = '9px'
const PREV_FS_LABEL = '8px'
const PREV_BAR_OPENED_SCALE = 6
const PREV_BAR_CLOSED_SCALE = 4
const PREV_BAR_CLOSED_BASE = 8
const PREV_CLR_TEXT = '#f9fafb'
const PREV_CLR_MUTED = '#9ca3af'
const PREV_CLR_SECONDARY = '#cbd5e1'
const PREV_CLR_DIM = '#d1d5db'
const PREV_CLR_CPU = '#60a5fa'
const PREV_CLR_MEM = '#c084fc'

const ps = {
  card: {
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    borderRadius: '12px',
    padding: `${PREV_MD} ${PREV_LG}`,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: PREV_CLR_TEXT,
    fontFamily: 'Inter, -apple-system, sans-serif',
    fontSize: PREV_FS_BODY,
    lineHeight: 1.4,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  } as CSSProperties,
  title: {
    fontSize: PREV_FS_BODY,
    fontWeight: 600,
    color: PREV_CLR_TEXT,
    marginBottom: PREV_SM,
    display: 'flex',
    alignItems: 'center',
    gap: PREV_SM,
  } as CSSProperties,
  dot: (color: string) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: color,
    display: 'inline-block',
    flexShrink: 0,
  }) as CSSProperties,
  statBlock: {
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: PREV_CARD_PAD,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '54px',
  } as CSSProperties,
  statVal: {
    fontSize: PREV_FS_STAT,
    fontWeight: 700,
    lineHeight: 1.2,
  } as CSSProperties,
  statLbl: {
    fontSize: PREV_FS_MICRO,
    color: PREV_CLR_MUTED,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: '1px',
  } as CSSProperties,
  row: { display: 'flex', gap: PREV_SM, alignItems: 'center' } as CSSProperties,
  col: { display: 'flex', flexDirection: 'column', gap: PREV_XS } as CSSProperties,
  muted: { color: PREV_CLR_MUTED, fontSize: PREV_FS_CAPTION } as CSSProperties,
  colors: {
    healthy: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    info: '#3b82f6',
    purple: '#9333ea',
  },
}

const SAMPLE_STATS: Record<string, number | string> = {
  total_clusters: 4,
  total_pods: 128,
  total_gpus: 32,
  cpu_usage: '67%',
  memory_usage: '54%',
  unhealthy_pods: 3,
  active_alerts: 2,
}

export function getWidgetPreviewDimensions(config: WidgetConfig | null): { width: number; height: number } | null {
  if (!config) return null

  if (config.type === 'card' && config.cardType) {
    const card = WIDGET_CARDS[config.cardType]
    return card ? card.defaultSize : null
  }

  if (config.type === 'stat' && config.statIds) {
    const selectedStats = config.statIds
      .map((statId) => WIDGET_STATS[statId])
      .filter((stat): stat is NonNullable<(typeof WIDGET_STATS)[keyof typeof WIDGET_STATS]> => Boolean(stat))

    if (selectedStats.length === 0) return null

    return {
      width: selectedStats.reduce((totalWidth, stat) => totalWidth + stat.size.width, 0),
      height: Math.max(...selectedStats.map((stat) => stat.size.height)),
    }
  }

  if (config.type === 'template' && config.templateId) {
    const template = WIDGET_TEMPLATES[config.templateId]
    return template ? template.size : null
  }

  return null
}

export function getWidgetPreviewScale(dimensions: { width: number; height: number } | null): number {
  if (!dimensions) return 1

  return Math.min(
    1,
    WIDGET_EXPORT_MODAL_PREVIEW_MAX_WIDTH_PX / dimensions.width,
    WIDGET_EXPORT_MODAL_PREVIEW_MAX_HEIGHT_PX / dimensions.height,
  )
}

export function WidgetPreviewPanel({ config, widgetCode, showCode, onToggleCode, widgetCodePanelId }: WidgetPreviewPanelProps) {
  const { t } = useTranslation('common')
  const previewDimensions = useMemo(() => getWidgetPreviewDimensions(config), [config])
  const previewScale = useMemo(() => getWidgetPreviewScale(previewDimensions), [previewDimensions])
  const previewStyle = useMemo<CSSProperties>(() => ({
    transform: `scale(${previewScale})`,
    transformOrigin: 'top center',
  }), [previewScale])

  return (
    <div className="sticky top-0 self-start w-1/2 flex flex-col overflow-hidden min-h-0 pb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{t('common.preview')}</span>
        <button
          onClick={onToggleCode}
          className="text-xs text-purple-400 hover:text-purple-300"
          aria-pressed={showCode}
          aria-controls={widgetCodePanelId}
        >
          {showCode ? t('widgets.hideCode') : t('widgets.showCode')}
        </button>
      </div>

      {showCode ? (
        <div id={widgetCodePanelId} className="flex-1 bg-card rounded-lg p-3 overflow-auto">
          <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono">
            {widgetCode || '// Select an item to generate widget code'}
          </pre>
        </div>
      ) : (
        <div className="flex-1 bg-secondary/50 rounded-lg p-4 flex items-start justify-center overflow-hidden min-w-0 min-h-[16rem]">
          <div className="max-w-full overflow-hidden origin-top" style={previewStyle}>
            <WidgetPreview config={config} />
          </div>
        </div>
      )}

      <div className="mt-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20 shrink-0 overflow-auto max-h-40">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-200">
            <p className="font-medium mb-1">{t('widgets.uebersichtSetup')}</p>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-300/80">
              <li>{t('widgets.downloadWidget')}</li>
              <li>
                Move to <code className="bg-blue-500/20 px-1 rounded">~/Library/Application Support/Übersicht/widgets/</code>
              </li>
              <li>{t('widgets.ensureAgentRunning')}</li>
              <li>{t('widgets.restartUebersicht')}</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

function WidgetPreview({ config }: { config: WidgetConfig | null }) {
  if (!config) {
    return (
      <div className="text-center text-muted-foreground">
        <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Select an item to preview</p>
      </div>
    )
  }

  if (config.type === 'card' && config.cardType) {
    return <CardPreview cardType={config.cardType} />
  }

  if (config.type === 'stat' && config.statIds) {
    return <StatPreview statIds={config.statIds} />
  }

  if (config.type === 'template' && config.templateId) {
    return <TemplatePreview templateId={config.templateId} />
  }

  return null
}

function CardPreview({ cardType }: { cardType: string }) {
  const { t } = useTranslation()
  const card = WIDGET_CARDS[cardType]
  if (!card) return null

  switch (cardType) {
    case 'cluster_health':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Cluster Health</div>
          <div style={ps.row}>
            <div style={{ ...ps.statBlock, borderLeft: `3px solid ${ps.colors.healthy}` }}>
              <span style={{ ...ps.statVal, color: ps.colors.healthy }}>3</span>
              <span style={ps.statLbl}>{t('common.healthy')}</span>
            </div>
            <div style={{ ...ps.statBlock, borderLeft: `3px solid ${ps.colors.error}` }}>
              <span style={{ ...ps.statVal, color: ps.colors.error }}>1</span>
              <span style={ps.statLbl}>{t('common.unhealthy')}</span>
            </div>
          </div>
        </div>
      )

    case 'pod_issues':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Pod Issues</div>
          <div style={ps.muted}>4 total issues</div>
          <div style={{ ...ps.col, marginTop: PREV_SM }}>
            <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: PREV_XS }}>
              <span style={{ color: ps.colors.error, fontWeight: 600, fontSize: PREV_FS_BODY }}>2</span>
              <span style={ps.muted}>CrashLoopBackOff</span>
            </div>
            <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: PREV_XS }}>
              <span style={{ color: ps.colors.warning, fontWeight: 600, fontSize: PREV_FS_BODY }}>1</span>
              <span style={ps.muted}>OOMKilled</span>
            </div>
            <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: PREV_XS }}>
              <span style={{ color: ps.colors.info, fontWeight: 600, fontSize: PREV_FS_BODY }}>1</span>
              <span style={ps.muted}>ImagePullBackOff</span>
            </div>
          </div>
        </div>
      )

    case 'gpu_overview':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.purple)} /> GPU Overview</div>
          <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
            <div style={{ fontSize: PREV_FS_HERO, fontWeight: 700, color: ps.colors.purple }}>72%</div>
            <div style={ps.muted}>{t('common.utilization')}</div>
          </div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={ps.statVal}>32</span>
              <span style={ps.statLbl}>{t('common.total')}</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, color: ps.colors.purple }}>23</span>
              <span style={ps.statLbl}>{t('common.allocated')}</span>
            </div>
          </div>
        </div>
      )

    case 'hardware_health':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Hardware Health</div>
          <div style={{ ...ps.row, marginBottom: PREV_SM }}>
            <div style={{ ...ps.statBlock, borderLeft: `4px solid ${ps.colors.healthy}` }}>
              <span style={ps.statVal}>4</span>
              <span style={ps.statLbl}>{t('common.nodes')}</span>
            </div>
            <div style={{ ...ps.statBlock, borderLeft: `4px solid ${ps.colors.purple}` }}>
              <span style={{ ...ps.statVal, color: ps.colors.purple }}>16</span>
              <span style={ps.statLbl}>{t('common.gpus')}</span>
            </div>
            <div style={{ ...ps.statBlock, borderLeft: `4px solid ${ps.colors.info}` }}>
              <span style={{ ...ps.statVal, color: ps.colors.info }}>8</span>
              <span style={ps.statLbl}>NICs</span>
            </div>
          </div>
          <div style={ps.col}>
            <div style={{ fontSize: PREV_FS_MICRO, fontWeight: 600, color: PREV_CLR_MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alerts (2)</div>
            <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: PREV_XS, borderLeft: `4px solid ${ps.colors.error}` }}>
              <span style={{ fontSize: PREV_FS_CAPTION, color: ps.colors.error, fontWeight: 600 }}>GPU</span>
              <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED, marginLeft: PREV_XS }}>worker-3 (-2)</span>
            </div>
            <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: PREV_XS, borderLeft: `4px solid ${ps.colors.warning}` }}>
              <span style={{ fontSize: PREV_FS_CAPTION, color: ps.colors.warning, fontWeight: 600 }}>NIC</span>
              <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED, marginLeft: PREV_XS }}>worker-1 (-1)</span>
            </div>
          </div>
        </div>
      )

    case 'nightly_e2e_status':
      return <NightlyE2EPreview />

    case 'security_issues':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> Security Issues</div>
          <div style={ps.col}>
            {[
              { label: 'Privileged containers', count: 3, color: ps.colors.error },
              { label: 'No resource limits', count: 12, color: ps.colors.warning },
              { label: 'Running as root', count: 5, color: ps.colors.error },
            ].map((item) => (
              <div key={item.label} className="px-2 py-1" style={{ ...ps.row, backgroundColor: item.color === ps.colors.error ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', borderRadius: PREV_XS }}>
                <span style={{ color: item.color, fontWeight: 600, fontSize: PREV_FS_BODY, minWidth: '16px' }}>{item.count}</span>
                <span style={ps.muted}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'active_alerts':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.error)} /> Active Alerts</div>
          <div style={ps.col}>
            {[
              { name: 'HighMemoryUsage', severity: 'critical', ns: 'monitoring' },
              { name: 'PodCrashLooping', severity: 'warning', ns: 'default' },
              { name: 'NodeDiskPressure', severity: 'warning', ns: 'kube-system' },
            ].map((alert) => (
              <div key={alert.name} className="px-2 py-1" style={{ ...ps.row, backgroundColor: alert.severity === 'critical' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', borderRadius: PREV_XS, borderLeft: `4px solid ${alert.severity === 'critical' ? ps.colors.error : ps.colors.warning}` }}>
                <span style={{ fontSize: PREV_FS_CAPTION, color: alert.severity === 'critical' ? ps.colors.error : ps.colors.warning, fontWeight: 600 }}>{alert.name}</span>
                <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED, marginLeft: 'auto' }}>{alert.ns}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'helm_releases':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Helm Releases</div>
          <div style={ps.col}>
            {[
              { name: 'ingress-nginx', status: 'deployed', ver: '4.8.3' },
              { name: 'cert-manager', status: 'deployed', ver: '1.13.2' },
              { name: 'prometheus', status: 'deployed', ver: '25.8.0' },
              { name: 'redis', status: 'failed', ver: '18.4.0' },
            ].map((release) => (
              <div key={release.name} style={{ ...ps.row, justifyContent: 'space-between' }}>
                <span style={{ fontSize: PREV_FS_CAPTION, fontWeight: 500 }}>{release.name}</span>
                <span style={{ fontSize: PREV_FS_MICRO, color: release.status === 'deployed' ? ps.colors.healthy : ps.colors.error }}>{release.status}</span>
                <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED }}>{release.ver}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'top_pods':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Top Pods</div>
          <div style={ps.col}>
            {[
              { name: 'ml-training-job-7x', cpu: '3.2 cores', mem: '12.4 Gi' },
              { name: 'prometheus-server-0', cpu: '1.8 cores', mem: '8.2 Gi' },
              { name: 'elasticsearch-data-1', cpu: '1.4 cores', mem: '6.1 Gi' },
            ].map((pod) => (
              <div key={pod.name} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_1}>{pod.name}</span>
                <span style={{ color: PREV_CLR_CPU }}>{pod.cpu}</span>
                <span style={{ color: PREV_CLR_MEM }}>{pod.mem}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'event_summary':
    case 'warning_events':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(cardType === 'warning_events' ? ps.colors.warning : ps.colors.info)} /> {card.displayName}</div>
          <div style={ps.col}>
            {[
              { type: 'Warning', count: 12, msg: 'BackOff restarting failed container' },
              { type: 'Warning', count: 5, msg: 'Readiness probe failed' },
              { type: 'Normal', count: 34, msg: 'Scheduled successfully' },
            ].map((event, index) => (
              <div key={index} style={{ ...ps.row, fontSize: PREV_FS_CAPTION }}>
                <span style={{ color: event.type === 'Warning' ? ps.colors.warning : ps.colors.healthy, fontWeight: 600, minWidth: '18px' }}>{event.count}</span>
                <span style={{ color: PREV_CLR_SECONDARY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'operator_status':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Operator Status</div>
          <div style={ps.col}>
            {[
              { name: 'cert-manager', ready: true },
              { name: 'gpu-operator', ready: true },
              { name: 'prometheus-operator', ready: true },
              { name: 'node-feature-discovery', ready: false },
            ].map((operator) => (
              <div key={operator.name} style={{ ...ps.row, fontSize: PREV_FS_CAPTION }}>
                <span style={ps.dot(operator.ready ? ps.colors.healthy : ps.colors.warning)} />
                <span>{operator.name}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'storage_overview':
    case 'pvc_status':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> {card.displayName}</div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.info }}>24</span>
              <span style={ps.statLbl}>{t('common.pvcs')}</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.healthy }}>22</span>
              <span style={ps.statLbl}>{t('common.bound')}</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.warning }}>2</span>
              <span style={ps.statLbl}>{t('common.pending')}</span>
            </div>
          </div>
        </div>
      )

    case 'network_overview':
    case 'service_status':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> {card.displayName}</div>
          <div style={{ ...ps.row, marginBottom: PREV_SM }}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT }}>18</span>
              <span style={ps.statLbl}>{t('common.services')}</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.info }}>6</span>
              <span style={ps.statLbl}>Policies</span>
            </div>
          </div>
          <div style={ps.col}>
            {['ClusterIP (12)', 'LoadBalancer (4)', 'NodePort (2)'].map((service) => (
              <div key={service} style={{ fontSize: PREV_FS_CAPTION, color: PREV_CLR_MUTED }}>{service}</div>
            ))}
          </div>
        </div>
      )

    case 'opencost_overview':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> OpenCost Overview</div>
          <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
            <div style={{ fontSize: PREV_FS_HEADLINE, fontWeight: 700, color: ps.colors.healthy }}>$1,247</div>
            <div style={ps.muted}>Monthly estimate</div>
          </div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: PREV_CLR_CPU }}>$482</span>
              <span style={ps.statLbl}>Compute</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: PREV_CLR_MEM }}>$635</span>
              <span style={ps.statLbl}>GPU</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: ps.colors.info }}>$130</span>
              <span style={ps.statLbl}>{t('common.storage')}</span>
            </div>
          </div>
        </div>
      )

    case 'provider_health':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Provider Health</div>
          <div style={ps.col}>
            {[
              { name: 'OpenAI', status: 'operational', color: ps.colors.healthy },
              { name: 'Anthropic', status: 'operational', color: ps.colors.healthy },
              { name: 'AWS', status: 'degraded', color: ps.colors.warning },
              { name: 'GCP', status: 'operational', color: ps.colors.healthy },
            ].map((provider) => (
              <div key={provider.name} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_2}>{provider.name}</span>
                <span style={{ color: provider.color }}>{provider.status}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'nightly_release_pulse':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Nightly Release Pulse</div>
          <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
            <div style={{ fontSize: PREV_FS_FEATURED, fontWeight: 700, color: ps.colors.healthy }}>v0.3.22</div>
            <div style={ps.muted}>Released 2h ago</div>
          </div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: ps.colors.healthy }}>12</span>
              <span style={ps.statLbl}>Streak</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: ps.colors.info }}>93%</span>
              <span style={ps.statLbl}>Pass rate</span>
            </div>
          </div>
        </div>
      )

    case 'workflow_matrix':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Workflow Matrix</div>
          <div style={ps.col}>
            {['build', 'test', 'lint', 'deploy'].map((workflow) => (
              <div key={workflow} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_2}>{workflow}</span>
                <div style={{ display: 'flex', gap: PREV_DOTS_GAP }}>
                  {[1, 2, 3, 4, 5].map((index) => (
                    <div key={index} style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: index === 3 && workflow === 'deploy' ? ps.colors.error : ps.colors.healthy }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )

    case 'pipeline_flow':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Live Runs</div>
          <div style={ps.col}>
            {[
              { name: 'build (amd64)', status: 'running', time: '3m 12s' },
              { name: 'fullstack-smoke', status: 'queued', time: 'queued' },
              { name: 'coverage-gate', status: 'success', time: '24s' },
            ].map((run) => (
              <div key={run.name} className="px-2 py-1" style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION, backgroundColor: 'rgba(30,41,59,0.5)', borderRadius: PREV_XS }}>
                <span style={ps.dot(run.status === 'running' ? ps.colors.info : run.status === 'success' ? ps.colors.healthy : PREV_CLR_MUTED)} />
                <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_3}>{run.name}</span>
                <span style={{ color: PREV_CLR_MUTED, fontSize: PREV_FS_MICRO }}>{run.time}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'recent_failures':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.error)} /> Recent Failures</div>
          <div style={ps.col}>
            {[
              { wf: 'nightly-test-suite', step: 'e2e-tests', ago: '2h ago' },
              { wf: 'build', step: 'lint', ago: '5h ago' },
            ].map((failure) => (
              <div key={failure.wf} className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: PREV_XS, borderLeft: `3px solid ${ps.colors.error}` }}>
                <div style={WIDGET_EXPORT_MODAL_DIV_STYLE_2}>
                  <div style={{ fontSize: PREV_FS_CAPTION, fontWeight: 600, color: ps.colors.error }}>{failure.wf}</div>
                  <div style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED }}>Failed at: {failure.step}</div>
                </div>
                <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED }}>{failure.ago}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'issue_activity_chart':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Daily Issues &amp; PRs</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: PREV_BAR_GAP, height: '60px', marginBottom: PREV_SM }}>
            {[4, 7, 3, 8, 5, 6, 9, 2, 5, 7, 4, 6, 3].map((value, index) => (
              <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: PREV_HAIRLINE_GAP, justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ height: `${value * PREV_BAR_OPENED_SCALE}px`, backgroundColor: ps.colors.info, borderRadius: '1px', opacity: 0.7 }} />
                <div style={{ height: `${Math.max(0, (PREV_BAR_CLOSED_BASE - value) * PREV_BAR_CLOSED_SCALE)}px`, backgroundColor: ps.colors.healthy, borderRadius: '1px', opacity: 0.5 }} />
              </div>
            ))}
          </div>
          <div style={ps.row}>
            <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.info }}>23</span><span style={ps.statLbl}>Opened</span></div>
            <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.healthy }}>18</span><span style={ps.statLbl}>Closed</span></div>
            <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.purple }}>12</span><span style={ps.statLbl}>Merged</span></div>
          </div>
        </div>
      )

    case 'github_ci_monitor':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> GitHub CI Monitor</div>
          <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
            <div style={{ fontSize: PREV_FS_HEADLINE, fontWeight: 700, color: ps.colors.healthy }}>94%</div>
            <div style={ps.muted}>Pass rate (7d)</div>
          </div>
          <div style={ps.row}>
            <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY }}>156</span><span style={ps.statLbl}>Runs</span></div>
            <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.healthy }}>147</span><span style={ps.statLbl}>Passed</span></div>
            <div style={ps.statBlock}><span style={{ ...ps.statVal, fontSize: PREV_FS_BODY, color: ps.colors.error }}>9</span><span style={ps.statLbl}>Failed</span></div>
          </div>
        </div>
      )

    case 'github_activity':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> GitHub Activity</div>
          <div style={ps.col}>
            {[
              { label: 'PRs merged (7d)', value: '24', color: ps.colors.purple },
              { label: 'Issues opened', value: '8', color: ps.colors.info },
              { label: 'Contributors', value: '6', color: ps.colors.healthy },
              { label: 'Latest release', value: 'v0.3.22', color: PREV_CLR_SECONDARY },
            ].map((item) => (
              <div key={item.label} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={{ color: PREV_CLR_MUTED }}>{item.label}</span>
                <span style={{ fontWeight: 600, color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'cluster_metrics':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Cluster Metrics</div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: PREV_CLR_CPU }}>62%</span>
              <span style={ps.statLbl}>CPU</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: PREV_CLR_MEM }}>78%</span>
              <span style={ps.statLbl}>Memory</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT_SM, color: ps.colors.healthy }}>45</span>
              <span style={ps.statLbl}>Pods</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: PREV_DOTS_GAP, height: '40px', marginTop: PREV_SM }}>
            {[40, 55, 62, 58, 70, 65, 72, 68, 75, 62].map((value, index) => (
              <div key={index} style={{ flex: 1, height: `${value * 0.55}px`, backgroundColor: ps.colors.info, borderRadius: '1px', opacity: 0.6 }} />
            ))}
          </div>
        </div>
      )

    case 'workload_status':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Workload Status</div>
          <div style={ps.col}>
            {[
              { name: 'Deployments', running: 12, total: 14, color: ps.colors.healthy },
              { name: 'StatefulSets', running: 3, total: 3, color: ps.colors.healthy },
              { name: 'DaemonSets', running: 4, total: 5, color: ps.colors.warning },
            ].map((workload) => (
              <div key={workload.name} className="px-2 py-1" style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_2}>{workload.name}</span>
                <span style={{ color: workload.running === workload.total ? ps.colors.healthy : ps.colors.warning }}>
                  {workload.running}/{workload.total} ready
                </span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'app_status':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> Application Status</div>
          <div style={ps.col}>
            {[
              { name: 'frontend', clusters: 3, status: 'healthy' },
              { name: 'api-gateway', clusters: 2, status: 'healthy' },
              { name: 'worker', clusters: 2, status: 'degraded' },
              { name: 'scheduler', clusters: 1, status: 'healthy' },
            ].map((app) => (
              <div key={app.name} style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_2}>{app.name}</span>
                <span style={{ color: PREV_CLR_MUTED, fontSize: PREV_FS_MICRO }}>{app.clusters} clusters</span>
                <span style={ps.dot(app.status === 'healthy' ? ps.colors.healthy : ps.colors.warning)} />
              </div>
            ))}
          </div>
        </div>
      )

    case 'namespace_overview':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.info)} /> Namespace Overview</div>
          <div style={ps.col}>
            {[
              { ns: 'default', pods: 12, deploys: 4 },
              { ns: 'kube-system', pods: 24, deploys: 8 },
              { ns: 'monitoring', pods: 6, deploys: 3 },
              { ns: 'production', pods: 18, deploys: 6 },
            ].map((namespace) => (
              <div key={namespace.ns} className="px-2 py-1" style={{ ...ps.row, justifyContent: 'space-between', fontSize: PREV_FS_CAPTION }}>
                <span style={{ fontWeight: 500, color: PREV_CLR_CPU }}>{namespace.ns}</span>
                <span style={{ color: PREV_CLR_MUTED }}>{namespace.pods} pods</span>
                <span style={{ color: PREV_CLR_MUTED }}>{namespace.deploys} deploys</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'console_ai_health_check':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.healthy)} /> AI Health Check</div>
          <div style={{ textAlign: 'center', marginBottom: PREV_SM }}>
            <div style={{ fontSize: PREV_FS_FEATURED, fontWeight: 700, color: ps.colors.healthy }}>Healthy</div>
            <div style={ps.muted}>AI analysis complete</div>
          </div>
          <div style={ps.col}>
            {[
              { finding: 'All nodes responding', severity: 'ok' },
              { finding: 'Pod restart rate normal', severity: 'ok' },
              { finding: 'Memory pressure on worker-2', severity: 'warn' },
            ].map((finding) => (
              <div key={finding.finding} className="px-2 py-1" style={{ ...ps.row, fontSize: PREV_FS_CAPTION }}>
                <span style={ps.dot(finding.severity === 'ok' ? ps.colors.healthy : ps.colors.warning)} />
                <span style={{ color: finding.severity === 'ok' ? PREV_CLR_SECONDARY : ps.colors.warning }}>{finding.finding}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'console_ai_offline_detection':
      return (
        <div style={ps.card}>
          <div style={ps.title}><span style={ps.dot(ps.colors.warning)} /> AI Offline Detection</div>
          <div style={ps.row}>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.healthy }}>11</span>
              <span style={ps.statLbl}>Online</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.error }}>1</span>
              <span style={ps.statLbl}>Offline</span>
            </div>
            <div style={ps.statBlock}>
              <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: ps.colors.warning }}>2</span>
              <span style={ps.statLbl}>GPUs down</span>
            </div>
          </div>
          <div className="px-2 py-1" style={{ ...ps.row, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: PREV_XS, borderLeft: `3px solid ${ps.colors.error}`, marginTop: PREV_SM }}>
            <span style={{ fontSize: PREV_FS_CAPTION, color: ps.colors.error, fontWeight: 600 }}>worker-4</span>
            <span style={{ fontSize: PREV_FS_MICRO, color: PREV_CLR_MUTED, marginLeft: 'auto' }}>unreachable 12m</span>
          </div>
        </div>
      )

    default:
      return <GenericCardPreview card={card} />
  }
}

function GenericCardPreview({ card }: { card: WidgetCardDefinition }) {
  const categoryData: Record<string, { dot: string; items: { label: string; value: string; color?: string }[] }> = {
    cluster: { dot: ps.colors.healthy, items: [{ label: 'Ready', value: '3/4', color: ps.colors.healthy }, { label: 'Nodes', value: '12' }, { label: 'Version', value: 'v1.28' }] },
    workload: { dot: ps.colors.info, items: [{ label: 'Running', value: '45', color: ps.colors.healthy }, { label: 'Pending', value: '2', color: ps.colors.warning }, { label: 'Failed', value: '1', color: ps.colors.error }] },
    gpu: { dot: ps.colors.purple, items: [{ label: 'Total', value: '32' }, { label: 'Allocated', value: '24', color: ps.colors.purple }, { label: 'Available', value: '8', color: ps.colors.healthy }] },
    security: { dot: ps.colors.warning, items: [{ label: 'Critical', value: '2', color: ps.colors.error }, { label: 'Warning', value: '5', color: ps.colors.warning }, { label: 'Info', value: '8', color: ps.colors.info }] },
    monitoring: { dot: ps.colors.info, items: [{ label: 'Active', value: '3', color: ps.colors.info }, { label: 'Resolved', value: '12', color: ps.colors.healthy }, { label: 'Silenced', value: '1' }] },
    'ci-cd': { dot: ps.colors.info, items: [{ label: 'Runs', value: '36', color: ps.colors.info }, { label: 'Passed', value: '34', color: ps.colors.healthy }, { label: 'Failed', value: '2', color: ps.colors.error }] },
  }
  const data = categoryData[card.category] || categoryData.monitoring

  return (
    <div style={ps.card}>
      <div style={ps.title}><span style={ps.dot(data.dot)} /> {card.displayName}</div>
      <div style={ps.row}>
        {data.items.map((item) => (
          <div key={item.label} style={ps.statBlock}>
            <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: item.color || PREV_CLR_TEXT }}>{item.value}</span>
            <span style={ps.statLbl}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatPreview({ statIds }: { statIds: string[] }) {
  return (
    <div style={{ ...ps.card, display: 'flex', flexWrap: 'wrap', gap: PREV_SM, padding: PREV_CARD_PAD, overflow: 'hidden' }}>
      {statIds.map((id) => {
        const stat = WIDGET_STATS[id]
        const value = SAMPLE_STATS[id] ?? '—'
        return (
          <div key={id} style={{ ...ps.statBlock, borderTop: `3px solid ${stat?.color || '#9333ea'}`, textAlign: 'center' }}>
            <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: stat?.color || '#fff' }}>{value}</span>
            <span style={ps.statLbl}>{stat?.displayName}</span>
          </div>
        )
      })}
    </div>
  )
}

function TemplatePreview({ templateId }: { templateId: string }) {
  const template = WIDGET_TEMPLATES[templateId]
  if (!template) return null

  const statsRow = template.stats && template.stats.length > 0 ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: PREV_XS, marginBottom: PREV_SM, overflow: 'hidden' }}>
      {template.stats.map((id) => {
        const stat = WIDGET_STATS[id]
        const value = SAMPLE_STATS[id] ?? '—'
        return (
          <div key={id} className="px-2 py-1" style={{ ...ps.statBlock, flex: 1, borderTop: `2px solid ${stat?.color || '#9333ea'}`, textAlign: 'center' }}>
            <span style={{ fontSize: PREV_FS_STAT_SM, fontWeight: 700, color: stat?.color || '#fff' }}>{value}</span>
            <span style={{ ...ps.statLbl, fontSize: PREV_FS_LABEL }}>{stat?.displayName}</span>
          </div>
        )
      })}
    </div>
  ) : null

  const cardMiniStyle: CSSProperties = {
    flex: 1,
    backgroundColor: 'rgba(31, 41, 55, 0.5)',
    borderRadius: '6px',
    padding: PREV_ITEM_PAD,
    border: '1px solid rgba(255, 255, 255, 0.05)',
  }

  const isGrid = template.layout === 'grid'
  const isRow = template.layout === 'row'
  const cardsContainer: CSSProperties = isGrid
    ? { display: 'grid', gridTemplateColumns: `repeat(${template.gridCols || 2}, 1fr)`, gap: PREV_XS }
    : isRow
      ? { display: 'flex', gap: PREV_XS }
      : { display: 'flex', flexDirection: 'column', gap: PREV_XS }

  return (
    <div style={{ ...ps.card, maxWidth: 320 }}>
      <div style={{ ...ps.title, fontSize: PREV_FS_BODY, marginBottom: PREV_SM }}>{template.displayName}</div>
      {statsRow}
      {template.cards.length > 0 && (
        <div style={cardsContainer}>
          {template.cards.map((cardType) => {
            const card = WIDGET_CARDS[cardType]
            return (
              <div key={cardType} style={cardMiniStyle}>
                <div style={{ fontSize: PREV_FS_MICRO, fontWeight: 600, color: PREV_CLR_DIM, marginBottom: PREV_XS }}>{card?.displayName || cardType}</div>
                <div style={{ fontSize: PREV_FS_STAT_SM, fontWeight: 700, color: ps.colors.purple }}>
                  {cardType === 'cluster_health' ? '3/4' : cardType === 'pod_issues' ? '4' : cardType === 'gpu_overview' ? '72%' : cardType === 'security_issues' ? '20' : '—'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NightlyE2EPreview() {
  const platforms = [
    {
      name: 'OCP',
      color: '#f97316',
      guides: [
        { acronym: 'IS', dots: ['g', 'g', 'r', 'g', 'g', 'g', 'g'] },
        { acronym: 'PD', dots: ['g', 'g', 'g', 'g', 'g', 'g', 'g'] },
        { acronym: 'PPC', dots: ['g', 'r', 'g', 'g', 'g', 'r', 'g'] },
        { acronym: 'TPC', dots: ['g', 'g', 'g', 'r', 'g', 'g', 'g'] },
        { acronym: 'WEP', dots: ['g', 'g', 'g', 'g', 'g', 'g', 'b'] },
        { acronym: 'WVA', dots: ['g', 'r', 'g', 'g', 'r', 'g', 'g'] },
      ],
    },
    {
      name: 'GKE',
      color: '#3b82f6',
      guides: [
        { acronym: 'IS', dots: ['g', 'g', 'g', 'g', 'g', 'g', 'g'] },
        { acronym: 'PD', dots: ['r', 'g', 'g', 'g', 'g', 'g', 'g'] },
        { acronym: 'WEP', dots: ['g', 'g', 'g', 'g', 'g', 'g', 'g'] },
      ],
    },
    {
      name: 'CKS',
      color: '#a855f7',
      guides: [
        { acronym: 'IS', dots: [] as string[] },
        { acronym: 'PD', dots: [] as string[] },
        { acronym: 'WEP', dots: [] as string[] },
      ],
    },
  ]
  const dotColor: Record<string, string> = { g: '#22c55e', r: '#ef4444', b: '#60a5fa' }

  return (
    <div style={{ ...ps.card, width: 320, fontSize: PREV_FS_CAPTION, padding: PREV_CARD_PAD }}>
      <div style={ps.title}><span style={ps.dot('#22c55e')} /> Nightly E2E Status</div>
      <div style={{ display: 'flex', gap: PREV_LG, marginBottom: PREV_SM }}>
        <div><span style={{ fontSize: PREV_FS_STAT, fontWeight: 700, color: '#a855f7' }}>87%</span><div style={ps.muted}>Pass Rate</div></div>
        <div><span style={{ fontSize: PREV_FS_STAT, fontWeight: 700 }}>16</span><div style={ps.muted}>Guides</div></div>
        <div><span style={{ fontSize: PREV_FS_STAT, fontWeight: 700, color: '#ef4444' }}>3</span><div style={ps.muted}>Failing</div></div>
      </div>
      {platforms.map((platform) => (
        <div key={platform.name} className="mb-1">
          <div className="mb-1" style={{ color: platform.color, fontWeight: 600, fontSize: PREV_FS_MICRO }}>{platform.name}</div>
          {platform.guides.map((guide) => (
            <div key={`${platform.name}-${guide.acronym}`} className="flex items-center gap-1" style={{ marginBottom: PREV_HAIRLINE_GAP }}>
              <span style={WIDGET_EXPORT_MODAL_SPAN_STYLE_4}>{guide.acronym}</span>
              <div style={{ display: 'flex', gap: PREV_DOTS_GAP }}>
                {guide.dots.length > 0 ? guide.dots.map((dot, index) => (
                  <span key={index} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dotColor[dot], display: 'inline-block', ...(dot === 'b' ? { animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' } : {}) }} />
                )) : (
                  <span style={{ color: '#4b5563', fontSize: PREV_FS_LABEL }}>no runs</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default WidgetPreviewPanel
