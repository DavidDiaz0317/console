import { usePersistedSettings } from '@/hooks/usePersistedSettings'

// Runs usePersistedSettings early to restore settings from ~/.kc/settings.json
// if localStorage was cleared. Must be inside AuthProvider for API access.
export function SettingsSyncInit() {
  usePersistedSettings()
  return null
}
