/**
 * Constants and utilities for the Missions system.
 * Extracted from useMissions.tsx to reduce file size (#12209).
 */

import type { MissionMessage } from './useMissionTypes'
import { MS_PER_MINUTE, SECONDS_PER_DAY } from '../lib/constants/time'

/**
 * #7089 — Monotonic counter for generating unique request IDs. The previous
 * `claude-${Date.now()}` pattern could collide when two requests were sent
 * in the same millisecond (rapid sends, concurrent tabs). A monotonic counter
 * combined with a random suffix guarantees uniqueness within the same tab,
 * and the random suffix provides uniqueness across tabs.
 */
let requestIdCounter = 0
export function generateRequestId(prefix = 'claude'): string {
  requestIdCounter += 1
  return `${prefix}-${Date.now()}-${requestIdCounter}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`
}

/** Delay before auto-reconnecting interrupted missions after WS opens */
export const MISSION_RECONNECT_DELAY_MS = 500

/**
 * Maximum age (ms) a disconnected mission may have before auto-resume is
 * considered unsafe (#6371). Agents purge sessions after a short idle
 * window, so resuming a mission whose last update was hours ago is very
 * likely to hit a GONE/not_found session on the backend — or worse, land
 * the user's prompt in a disjointed new thread. Past this threshold the
 * mission is transitioned to `failed` with an actionable message so the
 * user can explicitly retry instead of the agent silently replaying a
 * half-finished prompt. 30 minutes is conservative: it covers lunch/
 * meeting gaps while still protecting against overnight reconnects.
 */
export const MISSION_RECONNECT_MAX_AGE_MS = 30 * MS_PER_MINUTE

/**
 * issue 6429 — Cap how many prior messages we re-append to the prompt on
 * reconnect. Long-running missions can accumulate hundreds of turns; some
 * agents (notably ones with 8k–32k token budgets) reject the payload
 * outright with HTTP 413. We always keep the most recent
 * MAX_RESENT_MESSAGES items (which always include the last user message
 * that is re-sent separately) and drop anything older.
 */
export const MAX_RESENT_MESSAGES = 20

/** Initial delay (ms) before auto-reconnecting WebSocket after close */
export const WS_RECONNECT_INITIAL_DELAY_MS = 1_000

/** Maximum delay (ms) between reconnection attempts (backoff cap) */
export const WS_RECONNECT_MAX_DELAY_MS = 30_000

/** Maximum number of consecutive reconnection attempts before giving up */
export const WS_RECONNECT_MAX_RETRIES = 10

/** Maximum time (ms) to wait for a WebSocket connection to open */
export const WS_CONNECTION_TIMEOUT_MS = 5_000

/** Delay before showing "Waiting for response..." status */
export const STATUS_WAITING_DELAY_MS = 500

/** Delay before showing "Processing with AI..." status */
export const STATUS_PROCESSING_DELAY_MS = 3_000

/**
 * Maximum time (ms) a mission is allowed to stay in "running" state before the
 * frontend considers it timed out and transitions it to "failed".  This acts as
 * a client-side safety net in case the backend timeout fires but the error
 * message is lost (e.g., WebSocket reconnect race), or the backend itself is
 * unreachable.  Matches the backend missionExecutionTimeout (5 min) plus a
 * small grace period for network latency.
 */
export const MISSION_TIMEOUT_MS = 300_000 // 5 minutes

/** How often (ms) the frontend checks for timed-out missions */
export const MISSION_TIMEOUT_CHECK_INTERVAL_MS = 15_000 // 15 seconds

/**
 * If streaming has started (at least one chunk received) but no new chunk
 * arrives within this window, the agent is assumed to be stuck waiting on a
 * tool call (e.g., an APISIX gateway that never responds) and the mission is
 * failed early with an actionable message (#3079).
 */
export const MISSION_INACTIVITY_TIMEOUT_MS = 90_000 // 90 seconds of stream silence

/**
 * Maximum time (ms) the frontend waits for backend acknowledgment after sending
 * a cancel request. If the backend doesn't respond within this window, the
 * frontend transitions the mission from 'cancelling' to 'failed' as a safety net.
 */
export const CANCEL_ACK_TIMEOUT_MS = 10_000 // 10 seconds

/**
 * WebSocket message types the frontend accepts as a dedicated cancel
 * acknowledgement (#8106). Kept as named constants to avoid magic strings
 * and to make the protocol contract easy to audit. The backend currently
 * emits `result` messages with `{cancelled, sessionId}` shape instead, which
 * is handled as a compatibility path in the message router.
 */
export const CANCEL_ACK_MESSAGE_TYPE = 'cancel_ack'
export const CANCEL_CONFIRMED_MESSAGE_TYPE = 'cancel_confirmed'

/**
 * Maximum time (ms) a mission may sit in 'waiting_input' with no new
 * assistant/result message before the frontend treats it as stuck and
 * transitions it to 'failed' (#5936). This state is entered when a streaming
 * turn ends without a final 'result' message; if the backend never sends
 * one (lost event, disconnected agent, etc.) the mission would otherwise
 * hang indefinitely.
 */
export const WAITING_INPUT_TIMEOUT_MS = 600_000 // 10 minutes

/**
 * Patterns that identify system messages generated when the local agent is
 * unreachable. Used by both the reconnect useEffect (#10525) and the retry
 * path in sendMessage to strip stale errors from chat history.
 */
export const AGENT_DISCONNECT_ERROR_PATTERNS = [
  'Local Agent Not Connected',
  'agent not available',
  'agent not responding',
] as const

/** Returns true when a MissionMessage is a stale agent-disconnect error. */
export function isStaleAgentErrorMessage(msg: MissionMessage): boolean {
  return (
    msg.role === 'system' &&
    AGENT_DISCONNECT_ERROR_PATTERNS.some(pattern => msg.content.includes(pattern))
  )
}
