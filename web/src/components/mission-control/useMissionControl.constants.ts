import { MS_PER_DAY } from '../../lib/constants/time'

export const STORAGE_KEY = 'kc_mission_control_state'
export const QUOTA_BANNER_KEY = 'kc_mission_control_quota_error'
export const PERSISTED_SCHEMA_VERSION = 1
export const WIZARD_STATE_TTL_MS = 7 * MS_PER_DAY

export const PROJECT_NAME_MAX_LENGTH = 64
export const PROJECT_NAME_ALLOWED_REGEX = /^[A-Za-z0-9 _\-.()]+$/

export const STREAM_JSON_DEBOUNCE_MS = 250
export const MAX_BALANCED_BLOCKS_INPUT = 200_000
export const PERSIST_STATE_DEBOUNCE_MS = 300
export const PERSIST_KEYSTROKE_DEBOUNCE_MS = PERSIST_STATE_DEBOUNCE_MS
export const MAX_FENCE_BODY = 50_000
export const AI_SUGGEST_TIMEOUT_MS = 30_000
