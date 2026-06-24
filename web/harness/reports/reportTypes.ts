export interface InvariantReportStatus {
  invariantId: string
  status: 'passed' | 'failed' | 'skipped' | 'unknown'
  details?: string
}

export interface VisualLoginReport {
  status: 'passed' | 'failed' | 'unknown'
  generatedAt: string
  runtimeMs?: number
  appUrl?: string
  appMode?: string
  invariants: InvariantReportStatus[]
  artifacts: string[]
  skipped: string[]
}
