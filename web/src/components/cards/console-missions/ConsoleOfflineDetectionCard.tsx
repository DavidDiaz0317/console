import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { useMissions } from '../../../hooks/useMissions'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { ApiKeyPromptModal, useApiKeyCheck } from './shared'
import type { ConsoleMissionCardProps } from './shared'
import { OfflinePredictionAnalysis } from './OfflinePredictionAnalysis'
import { OfflineIssueList } from './OfflineIssueList'
import { useOfflineDetection } from './useOfflineDetection'

export function ConsoleOfflineDetectionCard(_props: ConsoleMissionCardProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { startMission, missions } = useMissions()
  const { drillToCluster, drillToNode } = useDrillDownActions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()
  const {
    offlineNodes,
    clusterHealthIssues,
    gpuIssues,
    predictedRisks,
    totalPredicted,
    criticalPredicted,
    aiPredictionCount,
    heuristicPredictionCount,
    currentClusterIssueCount,
    firstCurrentIssueCluster,
    thresholds,
    predictionInterval,
    aiEnabled,
    isAnalyzing,
    triggerAIAnalysis,
    submitFeedback,
    getFeedback,
  } = useOfflineDetection()

  const runningMission = missions.find(mission =>
    (mission.title.includes('Analysis') || mission.title.includes('Diagnose')) && mission.status === 'running',
  )

  return (
    <div className="h-full flex flex-col relative">
      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
      />

      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 mb-4">
        <div
          className={cn(
            'p-2 rounded-lg border',
            currentClusterIssueCount > 0
              ? 'bg-red-500/10 border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors'
              : 'bg-green-500/10 border-green-500/20 cursor-default',
          )}
          onClick={() => {
            if (firstCurrentIssueCluster) {
              drillToCluster(firstCurrentIssueCluster)
            }
          }}
          title={currentClusterIssueCount > 0
            ? t('common:healthCheck.issuesTooltip', { count: currentClusterIssueCount })
            : t('cards:consoleOfflineDetection.allHealthy')}
        >
          <div className="text-xl font-bold text-foreground">{currentClusterIssueCount}</div>
          <div className={cn('text-2xs', currentClusterIssueCount > 0 ? 'text-red-400' : 'text-green-400')}>
            {t('common:common.issues', { defaultValue: 'Issues' })}
          </div>
        </div>

        <div
          className={cn(
            'p-2 rounded-lg border',
            gpuIssues.length > 0
              ? 'bg-yellow-500/10 border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20 transition-colors'
              : 'bg-green-500/10 border-green-500/20 cursor-default',
          )}
          onClick={() => {
            if (gpuIssues[0]) {
              drillToCluster(gpuIssues[0].cluster)
            }
          }}
          title={gpuIssues.length > 0 ? `${gpuIssues.length} GPU issue${gpuIssues.length !== 1 ? 's' : ''} - Click to view` : 'All GPUs available'}
        >
          <div className="text-xl font-bold text-foreground">{gpuIssues.length}</div>
          <div className={cn('text-2xs', gpuIssues.length > 0 ? 'text-yellow-400' : 'text-green-400')}>
            {t('cards:consoleOfflineDetection.gpuIssues')}
          </div>
        </div>

        <OfflinePredictionAnalysis
          totalPredicted={totalPredicted}
          aiPredictionCount={aiPredictionCount}
          heuristicPredictionCount={heuristicPredictionCount}
          criticalPredicted={criticalPredicted}
          aiEnabled={aiEnabled}
          isAnalyzing={isAnalyzing}
          thresholds={thresholds}
          predictionInterval={predictionInterval}
          onTriggerAnalysis={triggerAIAnalysis}
        />
      </div>

      <OfflineIssueList
        offlineNodes={offlineNodes}
        clusterHealthIssues={clusterHealthIssues}
        gpuIssues={gpuIssues}
        predictedRisks={predictedRisks}
        drillToNode={drillToNode}
        drillToCluster={drillToCluster}
        startMission={startMission}
        checkKeyAndRun={checkKeyAndRun}
        runningMission={!!runningMission}
        getFeedback={getFeedback}
        submitFeedback={submitFeedback}
      />
    </div>
  )
}
