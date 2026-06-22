import type { MutationScenario } from './mutationTypes'
import { cardOverlap } from './scenarios/cardOverlap'
import { forceDemoLogin } from './scenarios/forceDemoLogin'
import { hiddenAiMissionButton } from './scenarios/hiddenAiMissionButton'
import { hideDashboardContent } from './scenarios/hideDashboardContent'
import { loginLayoutOverlap } from './scenarios/loginLayoutOverlap'
import { longClusterNameOverflow } from './scenarios/longClusterNameOverflow'
import { showBlockingGithubLoginOnDemo } from './scenarios/showBlockingGithubLoginOnDemo'
import { staleLoadingState } from './scenarios/staleLoadingState'
import { wrongClusterCount } from './scenarios/wrongClusterCount'
import { wrongPodStatus } from './scenarios/wrongPodStatus'

export const mutationScenarios: MutationScenario[] = [
  forceDemoLogin,
  showBlockingGithubLoginOnDemo,
  hideDashboardContent,
  staleLoadingState,
  loginLayoutOverlap,
  cardOverlap,
  longClusterNameOverflow,
  hiddenAiMissionButton,
  wrongClusterCount,
  wrongPodStatus,
]

export function getMutationScenario(id: string): MutationScenario {
  const scenario = mutationScenarios.find(item => item.id === id)
  if (!scenario) throw new Error(`Unknown visual/login mutation scenario: ${id}`)
  return scenario
}
