export interface ConsoleEvidenceEntry {
  type: string
  text: string
  location?: string
}

export interface NetworkEvidenceEntry {
  url: string
  method: string
  status?: number
  failureText?: string
}

export interface BoundingBoxEvidence {
  label: string
  x: number
  y: number
  width: number
  height: number
}

export interface LiveUiFailureEvidence {
  forbiddenMatches?: Array<{ label: string; text: string }>
  warningBadges?: Array<{ text: string; count: number }>
  textCollisions?: Array<{ first: string; second: string; ratio: number }>
  unexpectedNetworkResponses?: string[]
  unexpectedRequestFailures?: string[]
}

export interface VisualLoginEvidence {
  testTitle: string
  invariantIds: string[]
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted'
  url: string
  viewport: { width: number; height: number } | null
  browserProject: string
  appMode: string
  timestamp: string
  screenshotPath?: string
  console: {
    errors: ConsoleEvidenceEntry[]
    warnings: ConsoleEvidenceEntry[]
    pageErrors: string[]
  }
  network: {
    failed: NetworkEvidenceEntry[]
    errorResponses: NetworkEvidenceEntry[]
  }
  domSnippet?: string
  ariaSnapshot?: string
  boundingBoxes?: BoundingBoxEvidence[]
  liveUiFailures?: LiveUiFailureEvidence
}

export interface EvidenceCollectors {
  consoleErrors: ConsoleEvidenceEntry[]
  consoleWarnings: ConsoleEvidenceEntry[]
  pageErrors: string[]
  failedRequests: NetworkEvidenceEntry[]
  errorResponses: NetworkEvidenceEntry[]
  liveUiFailures?: LiveUiFailureEvidence
}
