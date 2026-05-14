import { useOrbitAutoRun } from '@/hooks/useOrbitAutoRun'

/** Runs orbit auto-maintenance checks — must be inside provider tree */
export function OrbitAutoRunner() {
  useOrbitAutoRun()
  return null
}
