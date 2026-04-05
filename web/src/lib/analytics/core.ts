/**
 * Anonymous Product Feedback — Lightweight Event Emitter (Core)
 *
 * Dual-path event delivery for maximum coverage:
 *   1. PRIMARY: gtag.js loaded via first-party proxy (/api/gtag) — events
 *      go directly from browser to GA4, appearing in Realtime reports.
 *   2. FALLBACK: Custom proxy path /api/m with base64-encoded payloads —
 *      used when ad blockers prevent gtag.js from loading. Events appear
 *      in standard GA4 reports but NOT in Realtime.
 *
 * The first-party proxy serves gtag.js from the console's own domain,
 * bypassing domain-based ad blockers. Content-based blockers may still
 * block it, in which case the custom proxy fallback kicks in.
 */

import { STORAGE_KEY_ANALYTICS_OPT_OUT, STORAGE_KEY_ANONYMOUS_USER_ID } from '../constants'
import { isDemoMode } from '../demoMode'

// DECOY Measurement ID — the proxy rewrites this to the real ID server-side.
const GA_MEASUREMENT_ID = 'G-0000000000'

const PROXY_PATH = '/api/m'
const GTAG_SCRIPT_PATH = '/api/gtag'

// ── Umami Integration ─────────────────────────────────────────────
// Umami runs in parallel with GA4 for a 2-week validation period.
// Events flow to both platforms via the send() function.
// Umami auto-tracks pageviews; custom events use umami.track().

/** First-party proxy path for the Umami tracking script — bypasses ad blockers */
const UMAMI_SCRIPT_PATH = '/api/ksc'
/** Umami website ID — configurable via branding; defaults to KubeStellar's ID */
let umamiWebsiteId = '07111027-162f-4e37-a0bb-067b9d08b88a'

/** Load Umami tracking script via first-party proxy (async, non-blocking).
 *  data-host-url tells Umami to POST events to our own origin (which proxies
 *  to analytics.kubestellar.io/api/send) instead of the script's source domain. */
function loadUmamiScript() {
  const script = document.createElement('script')
  script.src = UMAMI_SCRIPT_PATH
  script.defer = true
  script.dataset.websiteId = umamiWebsiteId
  // Umami appends /api/send internally — set host to our origin so events
  // go through the first-party proxy at /api/send → analytics.kubestellar.io
  script.dataset.hostUrl = window.location.origin
  document.head.appendChild(script)
}

/** Send event to Umami (fire-and-forget, never blocks GA4) */
function sendToUmami(eventName: string, params?: Record<string, string | number | boolean>) {
  try {
    if (window.umami?.track) {
      window.umami.track(eventName, params)
    }
  } catch {
    // Umami failures must never affect GA4 tracking
  }
}

// ── gtag.js Integration ─────────────────────────────────────────────
// gtag.js sends events directly from browser → GA4, which is required
// for GA4 Realtime reports. The custom proxy approach (server → GA4)
// only populates standard reports with a 24-48h delay.

let gtagAvailable = false
let gtagDecided = false  // true once we know whether gtag.js loaded or was blocked
let realMeasurementId = ''

// Events queued while waiting for gtag.js load verdict.
// Without queuing, events fire via the proxy (with our custom client ID) AND
// gtag.js creates its own _ga cookie client ID — GA4 sees two separate users,
// inflating active user counts.
let pendingEvents: Array<{ name: string; params?: Record<string, string | number | boolean> }> = []

// Maximum time to wait for gtag.js before falling back to proxy
const GTAG_LOAD_TIMEOUT_MS = 5_000
// Delay after script.onload to verify gtag.js actually initialized
const GTAG_INIT_CHECK_MS = 100

// Extend window for gtag + Umami globals
declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
    google_tag_manager: unknown // Defined by gtag.js when it initializes
    umami?: {
      track: (eventName: string, data?: Record<string, string | number | boolean>) => void
    }
  }
}
const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 min
const CID_KEY = '_ksc_cid'
const SID_KEY = '_ksc_sid'
const SC_KEY = '_ksc_sc'
const LAST_KEY = '_ksc_last'

// ── Bot / Headless Detection ────────────────────────────────────────
// Automated installs (CI pipelines, cloud VMs running curl|bash) start
// the console but never interact with it. Without filtering, these
// generate tens of thousands of fake "users" from data center IPs.
// We gate analytics on real user interaction to exclude them.

/** Returns true if the environment looks automated/headless */
function isAutomatedEnvironment(): boolean {
  try {
    // WebDriver flag — set by Puppeteer, Selenium, Playwright, headless Chrome
    if (navigator.webdriver) return true
    // Headless Chrome UA substring
    if (/HeadlessChrome/i.test(navigator.userAgent)) return true
    // PhantomJS
    if (/PhantomJS/i.test(navigator.userAgent)) return true
    // No browser plugins (headless browsers have none)
    // navigator.plugins is a PluginArray — check length, not truthiness
    if (navigator.plugins && navigator.plugins.length === 0 && !/Firefox/i.test(navigator.userAgent)) return true
    // No language preferences (bots often skip this)
    if (!navigator.languages || navigator.languages.length === 0) return true
  } catch {
    // If any check throws, assume real browser
  }
  return false
}

/** Whether a real user interaction has been detected */
let userHasInteracted = false
/** Whether analytics scripts have been loaded (only after interaction) */
let analyticsScriptsLoaded = false

/**
 * Pending chunk-reload recovery event captured at startup (before user
 * interaction). send() gates on userHasInteracted, so we defer the emit
 * until onFirstInteraction() to ensure the event reaches GA4.
 *
 * Recovery events are intentionally scoped to interactive sessions: if the
 * user never interacts after a chunk-reload recovery the session wasn't
 * meaningful and we'd rather not inflate the tracked recovery count with
 * bot/automated load traffic.
 */
let pendingRecoveryEvent: { latencyMs: number; page: string } | null = null

/** Set the pending chunk-reload recovery event (called from errors module) */
export function setPendingRecoveryEvent(event: { latencyMs: number; page: string } | null) {
  pendingRecoveryEvent = event
}

/**
 * Called on first user interaction (click, scroll, keypress, touch).
 * Loads analytics scripts and flushes the initial page_view / conversion events.
 */
function onFirstInteraction() {
  if (userHasInteracted) return
  userHasInteracted = true

  // Remove interaction listeners — they're no longer needed
  for (const evt of INTERACTION_GATE_EVENTS) {
    document.removeEventListener(evt, onFirstInteraction)
  }

  // Emit deferred chunk-reload recovery event captured at startup.
  // Must happen after userHasInteracted = true so send() doesn't drop it.
  if (pendingRecoveryEvent) {
    const { latencyMs, page } = pendingRecoveryEvent
    pendingRecoveryEvent = null
    send('ksc_chunk_reload_recovery', {
      recovery_result: 'success',
      recovery_latency_ms: latencyMs,
      recovery_page: page,
    })
  }

  if (!analyticsScriptsLoaded) {
    analyticsScriptsLoaded = true
    // NOW load gtag.js and Umami — only after a real human interacted
    if (gtagMeasurementId) loadGtagScript()
    if (umamiWebsiteId) loadUmamiScript()
    startEngagementTracking()

    // Fire the events that would have fired at page load.
    // Inline conversion step to avoid circular dep with events-system.ts.
    const deploymentType = getDeploymentType()
    send('ksc_conversion_step', { step_number: 1, step_name: 'discovery', deployment_type: deploymentType })
    // Inline page_view to avoid circular dep with events-ui.ts.
    emitUserEngagement()
    pageId = rand()
    send('page_view', { page_path: window.location.pathname, ksc_demo_mode: isDemoMode() ? 'true' : 'false' })
  }
}

const INTERACTION_GATE_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

// ── Engagement Time Tracking ──────────────────────────────────────
// GA4 requires the `_et` parameter (engagement time in milliseconds)
// to calculate Average Engagement Time. Without it, GA4 reports 0s.
// We track active user time via visibility + interaction signals.

const ENGAGEMENT_HEARTBEAT_MS = 5_000  // How often to sample engagement state
const ENGAGEMENT_IDLE_MS = 60_000      // Consider user idle after 60s of no interaction

let engagementStartMs = 0          // Timestamp when current active period began
let accumulatedEngagementMs = 0    // Total accumulated engagement time for current page
let lastInteractionMs = 0          // Timestamp of last user interaction
let isUserActive = false           // Whether user is currently considered active
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

/** Mark the user as actively engaged */
function markActive() {
  const now = Date.now()
  lastInteractionMs = now
  if (!isUserActive) {
    isUserActive = true
    engagementStartMs = now
  }
}

/** Check if user has gone idle and accumulate engagement time */
function checkEngagement() {
  if (!isUserActive) return
  const now = Date.now()
  if (now - lastInteractionMs > ENGAGEMENT_IDLE_MS) {
    // User went idle — accumulate time up to last interaction
    accumulatedEngagementMs += lastInteractionMs - engagementStartMs
    isUserActive = false
  }
}

/** Get total engagement time in ms without resetting (peek) */
function peekEngagementMs(): number {
  let total = accumulatedEngagementMs
  if (isUserActive) {
    total += Date.now() - engagementStartMs
  }
  return total
}

/** Get total engagement time in ms and reset the accumulator.
 *  Only called for user_engagement events — GA4 calculates Engaged Sessions
 *  and Average Engagement Time exclusively from _et on user_engagement hits.
 *  Other events get a non-resetting peek so the accumulator isn't drained. */
function getAndResetEngagementMs(): number {
  const total = peekEngagementMs()
  accumulatedEngagementMs = 0
  if (isUserActive) {
    engagementStartMs = Date.now()
  }
  return total
}

/** Start tracking user engagement via interaction and visibility signals */
function startEngagementTracking() {
  const interactionEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const
  for (const event of interactionEvents) {
    document.addEventListener(event, markActive, { passive: true })
  }

  // Track page visibility — pause engagement when tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (isUserActive) {
        accumulatedEngagementMs += Date.now() - engagementStartMs
        isUserActive = false
      }
      emitUserEngagement() // Flush engagement to GA4 before tab goes away
    } else {
      markActive()
    }
  })

  // Start heartbeat to detect idle
  heartbeatTimer = setInterval(checkEngagement, ENGAGEMENT_HEARTBEAT_MS)

  // Initial mark — user is active when page loads
  markActive()
}

/** Stop engagement tracking (called on opt-out) */
function stopEngagementTracking() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

/**
 * Emit a user_engagement event to GA4 with accumulated engagement time.
 * GA4 calculates Average Engagement Time exclusively from this event type —
 * the _et parameter on other events (page_view, custom events) is ignored
 * for engagement metrics.
 *
 * send() calls getAndResetEngagementMs() only for user_engagement events,
 * ensuring the full accumulated engagement time is attributed here.
 */
export function emitUserEngagement() {
  if (peekEngagementMs() > 0) {
    send('user_engagement', {})
  }
}

// ── Types ──────────────────────────────────────────────────────────

export type DeploymentType =
  | 'localhost'
  | 'containerized'
  | 'console.kubestellar.io'
  | 'netlify-preview'
  | 'unknown'

// ── Helpers ────────────────────────────────────────────────────────

function isOptedOut(): boolean {
  return localStorage.getItem(STORAGE_KEY_ANALYTICS_OPT_OUT) === 'true'
}

export function getDeploymentType(): DeploymentType {
  const h = window.location.hostname
  if (h === 'console.kubestellar.io') return 'console.kubestellar.io'
  if (h.includes('netlify.app')) return 'netlify-preview'
  if (h === 'localhost' || h === '127.0.0.1') return 'localhost'
  return 'containerized'
}

function rand(): string {
  return Math.floor(Math.random() * 2147483647).toString()
}

// ── Client & Session Management ────────────────────────────────────

function getClientId(): string {
  let cid = localStorage.getItem(CID_KEY)
  if (!cid) {
    cid = `${rand()}.${Math.floor(Date.now() / 1000)}`
    localStorage.setItem(CID_KEY, cid)
  }
  return cid
}

function getSession(): { sid: string; sc: number; isNew: boolean } {
  const now = Date.now()
  const lastActivity = Number(localStorage.getItem(LAST_KEY) || '0')
  let sid = localStorage.getItem(SID_KEY) || ''
  let sc = Number(localStorage.getItem(SC_KEY) || '0')
  const expired = !sid || (now - lastActivity > SESSION_TIMEOUT_MS)

  if (expired) {
    sid = Math.floor(now / 1000).toString()
    sc += 1
    localStorage.setItem(SID_KEY, sid)
    localStorage.setItem(SC_KEY, String(sc))
  }
  localStorage.setItem(LAST_KEY, String(now))
  return { sid, sc, isNew: expired }
}

// ── UTM Tracking ───────────────────────────────────────────────────
// Defined here (near sendViaProxy which reads utmParams) so the variable
// is available to both the proxy sender and the capture function.

/** Maximum length for UTM parameter values to avoid oversized beacon URLs */
const UTM_PARAM_MAX_LEN = 100

export interface UtmParams {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
}

let utmParams: UtmParams = {}

export function captureUtmParams() {
  const params = new URLSearchParams(window.location.search)
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
  for (const key of utmKeys) {
    const val = params.get(key)
    if (val) utmParams[key as keyof UtmParams] = val.slice(0, UTM_PARAM_MAX_LEN)
  }
  if (Object.keys(utmParams).length > 0) {
    sessionStorage.setItem('_ksc_utm', JSON.stringify(utmParams))
    send('ksc_utm_landing', utmParams as Record<string, string>)
  } else {
    const stored = sessionStorage.getItem('_ksc_utm')
    if (stored) {
      try { utmParams = JSON.parse(stored) as UtmParams } catch { /* ignore */ }
    }
  }
}

export function getUtmParams(): UtmParams {
  return { ...utmParams }
}

// ── Core Send ──────────────────────────────────────────────────────

let measurementId = ''
let pageId = ''
let userProperties: Record<string, string> = {}
let userId = ''
let initialized = false

// GA4 considers a session "engaged" after 10 seconds of active use.
// Once set, it stays true for the rest of the session.
const ENGAGED_SESSION_THRESHOLD_MS = 10_000
let sessionEngaged = false

/**
 * sendViaGtag sends an event through gtag.js (direct browser → GA4).
 * This path appears in GA4 Realtime reports because GA4 sees a real
 * browser session, not a server-side proxy request.
 */
function sendViaGtag(
  eventName: string,
  params?: Record<string, string | number | boolean>,
) {
  if (!window.gtag) return

  // Build gtag event parameters — gtag.js handles session management,
  // client ID, engagement time, etc. automatically. We only need to
  // pass event-specific params and user properties.
  const gtagParams: Record<string, string | number | boolean> = {
    ...(params || {}),
  }

  // Include engagement time for user_engagement events
  if (eventName === 'user_engagement') {
    const engagementMs = getAndResetEngagementMs()
    if (engagementMs > 0) {
      gtagParams.engagement_time_msec = engagementMs
    }
  } else {
    const engagementMs = peekEngagementMs()
    if (engagementMs > 0) {
      gtagParams.engagement_time_msec = engagementMs
    }
  }

  // Pass user ID if set
  if (userId) {
    gtagParams.user_id = userId
  }

  window.gtag('event', eventName, gtagParams)
}

/**
 * sendViaProxy sends an event through the custom first-party proxy
 * (/api/m). This fallback is used when gtag.js is blocked by ad blockers.
 * Events appear in standard GA4 reports but NOT in Realtime.
 */
function sendViaProxy(
  eventName: string,
  params?: Record<string, string | number | boolean>,
) {
  const { sid, sc, isNew } = getSession()

  const p = new URLSearchParams()
  p.set('v', '2')
  p.set('tid', measurementId)
  p.set('cid', getClientId())
  p.set('sid', sid)
  p.set('_p', pageId)
  p.set('en', eventName)
  p.set('_s', String(sc))
  p.set('dl', window.location.href)
  p.set('dt', document.title)
  p.set('ul', navigator.language)
  p.set('sr', `${screen.width}x${screen.height}`)

  if (isNew) {
    p.set('_ss', '1')
    p.set('_nsi', '1')
    sessionEngaged = false
  }
  if (sc === 1 && isNew) {
    p.set('_fv', '1')
  }

  if (!sessionEngaged && peekEngagementMs() >= ENGAGED_SESSION_THRESHOLD_MS) {
    sessionEngaged = true
  }
  if (sessionEngaged) {
    p.set('seg', '1')
  }

  if (eventName === 'user_engagement') {
    const engagementMs = getAndResetEngagementMs()
    if (engagementMs > 0) {
      p.set('_et', String(engagementMs))
    }
  } else {
    const engagementMs = peekEngagementMs()
    if (engagementMs > 0) {
      p.set('_et', String(engagementMs))
    }
  }

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'number') {
        p.set(`epn.${k}`, String(v))
      } else {
        p.set(`ep.${k}`, String(v))
      }
    }
  }

  for (const [k, v] of Object.entries(userProperties)) {
    p.set(`up.${k}`, v)
  }

  if (userId) {
    p.set('uid', userId)
  }

  if (utmParams.utm_source) p.set('cs', utmParams.utm_source)
  if (utmParams.utm_medium) p.set('cm', utmParams.utm_medium)
  if (utmParams.utm_campaign) p.set('cn', utmParams.utm_campaign)
  if (utmParams.utm_term) p.set('ck', utmParams.utm_term)
  if (utmParams.utm_content) p.set('cc', utmParams.utm_content)

  const encoded = btoa(p.toString())
  const url = `${PROXY_PATH}?d=${encodeURIComponent(encoded)}`

  if (navigator.sendBeacon) {
    navigator.sendBeacon(url)
  } else {
    fetch(url, { method: 'POST', keepalive: true }).catch(() => {})
  }
}

/**
 * Flush all queued events once we know whether gtag.js is available.
 * Called exactly once when gtagDecided transitions to true.
 */
function flushPendingEvents() {
  const queue = pendingEvents
  pendingEvents = []
  for (const evt of queue) {
    if (gtagAvailable) {
      sendViaGtag(evt.name, evt.params)
    } else {
      sendViaProxy(evt.name, evt.params)
    }
  }
}

/**
 * Mark gtag.js availability and flush any queued events.
 * Idempotent — only the first call takes effect.
 */
function markGtagDecided(available: boolean) {
  if (gtagDecided) return
  gtagAvailable = available
  gtagDecided = true
  flushPendingEvents()
}

/** @internal - use emit* functions for event tracking */
export function send(
  eventName: string,
  params?: Record<string, string | number | boolean>,
) {
  if (!initialized || isOptedOut()) return

  // Don't send any events until a real user has interacted.
  // This prevents automated/headless page loads from generating traffic.
  if (!userHasInteracted) return

  // Umami: send every event immediately (no queuing needed — Umami has its
  // own session management and doesn't conflict with GA4 client IDs)
  sendToUmami(eventName, params)

  // While waiting for gtag.js to load, queue events instead of sending
  // via the proxy. This prevents GA4 from seeing two different client IDs
  // (our _ksc_cid via proxy vs gtag's _ga cookie) for the same user.
  if (!gtagDecided) {
    pendingEvents.push({ name: eventName, params })
    return
  }

  // Primary path: gtag.js (appears in GA4 Realtime)
  if (gtagAvailable) {
    sendViaGtag(eventName, params)
    return
  }

  // Fallback: custom proxy (standard reports only, no Realtime)
  sendViaProxy(eventName, params)
}

// ── Initialization ─────────────────────────────────────────────────

// Public GA4 measurement ID — configurable via branding config.
// Defaults to KubeStellar's ID; overridden by initAnalytics().
let gtagMeasurementId = 'G-PXWNVQ8D1T'

// Google Tag Manager CDN — used when first-party proxy is unavailable (Netlify)
const GTAG_CDN_URL = 'https://www.googletagmanager.com/gtag/js'

/**
 * loadGtagScript loads gtag.js so events go directly from the browser to GA4.
 * This is required for GA4 Realtime — the custom proxy only populates standard
 * reports because GA4 can't see a real browser session through a server proxy.
 *
 * Loading order:
 *   1. Try first-party proxy (/api/gtag) — works with Go backend, bypasses
 *      domain-based ad blockers since it's same-origin.
 *   2. Fall back to Google CDN — works on Netlify (CSP allows it).
 *   3. If both fail (aggressive ad blocker) — custom proxy handles events.
 */
function loadGtagScript() {
  const mid = gtagMeasurementId
  realMeasurementId = mid

  // Initialize dataLayer and gtag function before script loads
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())

  // Pass our custom client_id so gtag.js uses the SAME identity as
  // our proxy fallback. Without this, gtag creates its own _ga cookie
  // client ID — GA4 sees two different users for the same person,
  // inflating active user counts.
  window.gtag('config', mid, {
    send_page_view: false, // We control page_view timing
    cookie_domain: 'auto',
    client_id: getClientId(),
  })

  // Set user properties explicitly via gtag('set') — more reliable than
  // passing them in the config call. This ensures deployment_type and
  // other user-scoped dimensions appear correctly in Realtime reports.
  window.gtag('set', 'user_properties', { ...userProperties })

  // Timeout: if gtag.js hasn't loaded in GTAG_LOAD_TIMEOUT_MS, fall back to proxy
  setTimeout(() => markGtagDecided(false), GTAG_LOAD_TIMEOUT_MS)

  // Helper: verify gtag.js actually initialized (not just HTTP 200 with wrong content).
  // On Netlify, /api/gtag returns HTML (SPA fallback) with HTTP 200 — the browser
  // fires onload but MIME-type checking prevents execution. We detect this by
  // checking for google_tag_manager, which real gtag.js always defines.
  const isGtagInitialized = () => typeof window.google_tag_manager !== 'undefined'

  // Helper: load gtag.js from Google CDN (used as fallback)
  const loadCdnFallback = () => {
    const cdnScript = document.createElement('script')
    cdnScript.async = true
    cdnScript.src = `${GTAG_CDN_URL}?id=${mid}`
    cdnScript.onload = () => {
      // Small delay to let gtag.js initialize before checking
      setTimeout(() => markGtagDecided(isGtagInitialized()), GTAG_INIT_CHECK_MS)
    }
    cdnScript.onerror = () => { markGtagDecided(false) } // Ad blocker blocked CDN too
    document.head.appendChild(cdnScript)
  }

  // Try first-party proxy first (Go backend serves gtag.js from same origin)
  const script = document.createElement('script')
  script.async = true
  script.src = `${GTAG_SCRIPT_PATH}?id=${mid}`
  script.onload = () => {
    // Verify the script actually initialized gtag.js — not just HTTP 200 with HTML.
    // On Netlify the SPA catch-all returns index.html for /api/gtag, which loads
    // (HTTP 200) but gets blocked by strict MIME type checking (nosniff).
    setTimeout(() => {
      if (isGtagInitialized()) {
        markGtagDecided(true)
      } else {
        loadCdnFallback()
      }
    }, GTAG_INIT_CHECK_MS)
  }
  script.onerror = () => {
    // First-party proxy returned non-200 — try Google CDN
    loadCdnFallback()
  }
  document.head.appendChild(script)
}

/**
 * Update analytics measurement IDs from branding config (white-label support).
 * Called by BrandingProvider after /health response arrives. Only non-empty
 * values override the hardcoded defaults — empty string means "use default",
 * not "disable". To disable analytics entirely, the interaction gate and
 * automated-environment checks handle that.
 */
export function updateAnalyticsIds(ids: {
  ga4MeasurementId?: string
  umamiWebsiteId?: string
}) {
  if (ids.ga4MeasurementId) {
    gtagMeasurementId = ids.ga4MeasurementId
  }
  if (ids.umamiWebsiteId) {
    umamiWebsiteId = ids.umamiWebsiteId
  }
}

export function initAnalytics() {
  measurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || GA_MEASUREMENT_ID
  if (!measurementId || initialized) return

  // Skip analytics entirely in automated/headless environments.
  // This filters CI pipelines, cloud VMs, Puppeteer, etc.
  if (isAutomatedEnvironment()) return

  initialized = true
  pageId = rand()

  // Set persistent user properties including timezone for geo identification
  const deploymentType = getDeploymentType()
  let tz = ''
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { /* ignore */ }
  userProperties = {
    deployment_type: deploymentType,
    demo_mode: String(isDemoMode()),
    ...(tz && { timezone: tz }),
  }

  // Flush engagement on page close (Safari doesn't always fire visibilitychange)
  window.addEventListener('beforeunload', emitUserEngagement)

  // Track unhandled errors globally for error categorization.
  // Import lazily to avoid circular dependency at module evaluation time.
  import('./errors').then(({ startGlobalErrorTracking }) => startGlobalErrorTracking())

  // Capture UTM parameters from landing URL
  captureUtmParams()

  // Gate analytics script loading on real user interaction.
  // Automated installs load the page but never click/scroll/type — this
  // single check eliminates ~25,000 bot "users" per day from data centers.
  for (const evt of INTERACTION_GATE_EVENTS) {
    document.addEventListener(evt, onFirstInteraction, { once: true, passive: true })
  }
}

// ── Anonymous User ID ──────────────────────────────────────────────

async function hashUserId(uid: string): Promise<string> {
  const data = new TextEncoder().encode(`ksc-analytics:${uid}`)

  // crypto.subtle is only available in secure contexts (HTTPS / localhost).
  // Fall back to a simple FNV-1a-style hash so analytics still works over HTTP.
  // Guard both `crypto` and `crypto.subtle` — some browsers (Safari on HTTP)
  // have `crypto` but `subtle` is undefined; others lack `crypto` entirely.
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    const FNV_OFFSET_BASIS = 0x811c9dc5
    const FNV_PRIME = 0x01000193
    let h = FNV_OFFSET_BASIS
    for (const byte of data) {
      h ^= byte
      h = Math.imul(h, FNV_PRIME)
    }
    return (h >>> 0).toString(16).padStart(8, '0')
  }

  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Get or create a persistent anonymous user ID for demo/unauthenticated users.
 * Stored in localStorage so the same browser always gets the same ID.
 * This ensures GA4 receives a unique user_id for every user — mixing
 * identified and anonymous sessions causes GA4 to delete data.
 */
function getOrCreateAnonymousId(): string {
  let anonId = localStorage.getItem(STORAGE_KEY_ANONYMOUS_USER_ID)
  if (!anonId) {
    anonId = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY_ANONYMOUS_USER_ID, anonId)
  }
  return anonId
}

export async function setAnalyticsUserId(uid: string) {
  // For demo/anonymous users, assign a persistent random ID so GA4 sees
  // consistent user_id on every session. Without this, GA4's mixed
  // identified/anonymous user model triggers data deletion.
  const effectiveUid = (!uid || uid === 'demo-user')
    ? getOrCreateAnonymousId()
    : uid
  userId = await hashUserId(effectiveUid)
  // Propagate to gtag if available
  if (gtagAvailable && window.gtag && realMeasurementId) {
    window.gtag('config', realMeasurementId, { user_id: userId })
  }
}

export function setAnalyticsUserProperties(props: Record<string, string>) {
  userProperties = { ...userProperties, ...props }
  // Propagate to gtag — use 'set' for reliable user property delivery
  if (gtagAvailable && window.gtag) {
    window.gtag('set', 'user_properties', props)
  }
}

// ── Opt-out management ─────────────────────────────────────────────

export function setAnalyticsOptOut(optOut: boolean) {
  // Fire the event BEFORE setting the flag — send() checks isOptedOut()
  // and would drop the event if the flag were already set.
  if (optOut) {
    send('ksc_analytics_opted_out', {})
  } else {
    send('ksc_analytics_opted_in', {})
  }
  localStorage.setItem(STORAGE_KEY_ANALYTICS_OPT_OUT, String(optOut))
  window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
  if (optOut) {
    stopEngagementTracking()
    document.cookie.split(';').forEach(c => {
      const name = c.split('=')[0].trim()
      if (name.startsWith('_ga') || name.startsWith('_ksc')) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
      }
    })
    localStorage.removeItem(CID_KEY)
    localStorage.removeItem(SID_KEY)
    localStorage.removeItem(SC_KEY)
    localStorage.removeItem(LAST_KEY)
  }
}

export function isAnalyticsOptedOut(): boolean {
  return isOptedOut()
}

// ── Page views ─────────────────────────────────────────────────────

export function emitPageView(path: string) {
  emitUserEngagement() // Flush previous page's engagement time before new page_view
  pageId = rand()      // New page ID for the new page
  send('page_view', { page_path: path, ksc_demo_mode: isDemoMode() ? 'true' : 'false' })
}
