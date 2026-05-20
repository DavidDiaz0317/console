import { Info, RefreshCw, Sparkles, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import type { OfflineDetectionThresholds } from './useOfflineDetection'

type OfflinePredictionAnalysisProps = {
  totalPredicted: number
  aiPredictionCount: number
  heuristicPredictionCount: number
  criticalPredicted: number
  aiEnabled: boolean
  isAnalyzing: boolean
  thresholds: OfflineDetectionThresholds
  predictionInterval: number
  onTriggerAnalysis: () => void
}

export function OfflinePredictionAnalysis({
  totalPredicted,
  aiPredictionCount,
  heuristicPredictionCount,
  criticalPredicted,
  aiEnabled,
  isAnalyzing,
  thresholds,
  predictionInterval,
  onTriggerAnalysis,
}: OfflinePredictionAnalysisProps) {
  const { t } = useTranslation(['cards'])

  return (
    <div
      className={cn(
        'p-2 rounded-lg border',
        totalPredicted > 0 && aiEnabled && !isAnalyzing
          ? 'bg-blue-500/10 border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-colors'
          : totalPredicted > 0
            ? 'bg-blue-500/10 border-blue-500/20 cursor-default'
            : 'bg-green-500/10 border-green-500/20 cursor-default',
      )}
      onClick={aiEnabled && !isAnalyzing ? onTriggerAnalysis : undefined}
      title={`Predictive Failure Detection:

Heuristic Rules (instant):
 Pods with ${thresholds.highRestartCount}+ restarts → likely to crash
 Clusters with >${thresholds.cpuPressure}% CPU → throttling risk
 Clusters with >${thresholds.memoryPressure}% memory → OOM risk
 GPU nodes at full capacity → no headroom

AI Analysis (${aiEnabled ? `every ${predictionInterval}m` : 'disabled'}):
${aiEnabled ? '• Trend detection over time\n• Correlated failure patterns\n• Anomaly detection' : '• Enable in Settings > Predictions'}

${totalPredicted > 0 ? `Current: ${heuristicPredictionCount} heuristic, ${aiPredictionCount} AI${criticalPredicted > 0 ? ` (${criticalPredicted} critical)` : ''}` : 'No predicted risks detected'}
${aiEnabled ? '\nClick to run AI analysis now' : ''}`}
    >
      <div className="flex items-center gap-1">
        {aiPredictionCount > 0 ? (
          <Sparkles className="w-3 h-3 text-blue-400" />
        ) : (
          <TrendingUp className={cn('w-3 h-3', totalPredicted > 0 ? 'text-blue-400' : 'text-green-400')} />
        )}
        <span className="text-xl font-bold text-foreground">{totalPredicted}</span>
        {isAnalyzing && <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />}
      </div>
      <div className={cn('text-2xs flex items-center gap-1', totalPredicted > 0 ? 'text-blue-400' : 'text-green-400')}>
        {t('cards:consoleOfflineDetection.predicted')}
        <Info className="w-3 h-3 opacity-60" />
      </div>
    </div>
  )
}
