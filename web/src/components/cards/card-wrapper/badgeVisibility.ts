export interface LiveBadgeState {
  isLive?: boolean
  showDemoIndicator: boolean
  isFailed: boolean
  consecutiveFailures?: number
}

export function shouldShowLiveBadge({
  isLive,
  showDemoIndicator,
  isFailed,
  consecutiveFailures = 0,
}: LiveBadgeState): boolean {
  return !!isLive && !showDemoIndicator && !isFailed && consecutiveFailures === 0
}
