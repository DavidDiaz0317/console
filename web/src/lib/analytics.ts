/**
 * Analytics — barrel re-export
 *
 * Split from a monolithic module into focused sub-modules for maintainability.
 * All public exports are re-exported here so existing imports continue to work.
 */
export * from './analytics/core'
export * from './analytics/errors'
export * from './analytics/events-ui'
export * from './analytics/events-missions'
export * from './analytics/events-system'
export * from './analytics/events-growth'
