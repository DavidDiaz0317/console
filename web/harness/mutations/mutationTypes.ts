import type { Page } from '@playwright/test'

export type MutationResultStatus = 'killed' | 'survived' | 'invalid' | 'skipped' | 'flaky'

export interface MutationContext {
  page: Page
}

export interface MutationScenario {
  id: string
  description: string
  targetInvariants: string[]
  expectedFailingTests: string[]
  setup: (context: MutationContext) => Promise<void>
  cleanup?: (context: MutationContext) => Promise<void>
  skipCondition?: () => string | null
}

export interface MutationResult {
  id: string
  status: MutationResultStatus
  targetInvariants: string[]
  expectedFailingTests: string[]
  message?: string
  timestamp: string
}
