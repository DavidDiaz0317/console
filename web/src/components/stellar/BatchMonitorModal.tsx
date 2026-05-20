import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { StellarNotification, StellarSolve, StellarSolveProgress } from '../../types/stellar'
import { formatRelativeTime } from './lib/time'

const BATCH_UPDATE_INTERVAL_MS = 2000
const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000

interface BatchEvent {
  id: string
  name: string
  status: 'pending' | 'in_progress' | 'resolved' | 'failed' | 'skipped'
  step?: string
  failureReason?: string
  durationSeconds: number
  startedAt?: string
  notification: StellarNotification
}

interface BatchProcessing {
  id: string
  startTime: string
  endTime?: string
  status: 'in_progress' | 'completed' | 'failed'
  totalEvents: number
  events: BatchEvent[]
  summary: {
    resolved: number
    failed: number
    skipped: number
    inProgress: number
  }
}

interface BatchMonitorModalProps {
  batchTimestamp: string
  notifications: StellarNotification[]
  solves: StellarSolve[]
  solveProgress: Record<string, StellarSolveProgress>
  onClose: () => void
}

function deriveEventStatus(
  notification: StellarNotification,
  solves: StellarSolve[],
  solveProgress: Record<string, StellarSolveProgress>
): BatchEvent['status'] {
  // Check live progress first
  const progress = solveProgress[notification.id]
  if (progress) {
    if (progress.step === 'resolved') return 'resolved'
    if (progress.step === 'escalated' || progress.step === 'exhausted') return 'failed'
    return 'in_progress'
  }

  // Check completed solves
  const solve = (solves || []).find(s => s.eventId === notification.id)
  if (solve) {
    if (solve.status === 'resolved') return 'resolved'
    if (solve.status === 'escalated' || solve.status === 'exhausted') return 'failed'
  }

  // If critical, assume it will be picked up
  if (notification.severity === 'critical') {
    return 'pending'
  }

  return 'skipped'
}

function deriveStepLabel(progress?: StellarSolveProgress): string | undefined {
  if (!progress) return undefined
  
  const stepMap: Record<string, string> = {
    investigating: 'Analyzing root cause…',
    root_cause: 'Generating remediation plan…',
    solving: 'Executing resolution…',
    verifying: 'Validating result…',
    reading: 'Analyzing root cause…',
    planning: 'Generating remediation plan…',
    acting: 'Executing resolution…',
    observing: 'Validating result…',
  }

  return stepMap[progress.step] || progress.message
}

function getStatusIcon(status: BatchEvent['status']): string {
  switch (status) {
    case 'pending': return '⏳'
    case 'in_progress': return '⊙'
    case 'resolved': return '✓'
    case 'failed': return '✗'
    case 'skipped': return '–'
    default: return '•'
  }
}

function getStatusColor(status: BatchEvent['status']): string {
  switch (status) {
    case 'pending': return 'var(--s-text-dim)'
    case 'in_progress': return 'var(--s-info)'
    case 'resolved': return 'var(--s-success)'
    case 'failed': return 'var(--s-critical)'
    case 'skipped': return 'var(--s-text-muted)'
    default: return 'var(--s-text)'
  }
}

export function BatchMonitorModal({
  batchTimestamp,
  notifications,
  solves,
  solveProgress,
  onClose,
}: BatchMonitorModalProps) {
  const { t } = useTranslation()
  const [elapsed, setElapsed] = useState(0)

  // Filter notifications to this batch
  const batchEvents = useMemo(() => {
    return (notifications || [])
      .filter(n => n.batchTimestamp === batchTimestamp)
      .map(n => {
        const status = deriveEventStatus(n, solves, solveProgress)
        const progress = solveProgress[n.id]
        const solve = (solves || []).find(s => s.eventId === n.id)
        
        const startedAt = solve?.startedAt || n.createdAt
        const now = Date.now()
        const start = new Date(startedAt).getTime()
        const durationSeconds = Math.floor((now - start) / MS_PER_SECOND)

        return {
          id: n.id,
          name: n.title,
          status,
          step: deriveStepLabel(progress),
          failureReason: solve?.error,
          durationSeconds,
          startedAt,
          notification: n,
        } as BatchEvent
      })
      .sort((a, b) => {
        // Sort: in_progress first, then by creation time
        const statusOrder = { in_progress: 0, pending: 1, resolved: 2, failed: 3, skipped: 4 }
        const aOrder = statusOrder[a.status] ?? 5
        const bOrder = statusOrder[b.status] ?? 5
        if (aOrder !== bOrder) return aOrder - bOrder
        return new Date(b.notification.createdAt).getTime() - new Date(a.notification.createdAt).getTime()
      })
  }, [notifications, batchTimestamp, solves, solveProgress])

  const batch = useMemo<BatchProcessing>(() => {
    const summary = {
      resolved: batchEvents.filter(e => e.status === 'resolved').length,
      failed: batchEvents.filter(e => e.status === 'failed').length,
      skipped: batchEvents.filter(e => e.status === 'skipped').length,
      inProgress: batchEvents.filter(e => e.status === 'in_progress').length,
    }

    const allDone = summary.inProgress === 0 && batchEvents.length > 0
    const anyFailed = summary.failed > 0

    return {
      id: batchTimestamp,
      startTime: batchTimestamp,
      endTime: allDone ? new Date().toISOString() : undefined,
      status: allDone ? (anyFailed ? 'failed' : 'completed') : 'in_progress',
      totalEvents: batchEvents.length,
      events: batchEvents,
      summary,
    }
  }, [batchEvents, batchTimestamp])

  // Update elapsed timer
  useEffect(() => {
    const start = new Date(batch.startTime).getTime()
    const updateElapsed = () => {
      const now = Date.now()
      setElapsed(Math.floor((now - start) / MS_PER_SECOND))
    }
    updateElapsed()
    const interval = setInterval(updateElapsed, BATCH_UPDATE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [batch.startTime])

  const formatElapsed = (seconds: number): string => {
    if (seconds < SECONDS_PER_MINUTE) return `${seconds}s`
    const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
    const secs = seconds % SECONDS_PER_MINUTE
    return `${minutes}m ${secs}s`
  }

  const progressPercent = batch.totalEvents > 0
    ? Math.round(((batch.summary.resolved + batch.summary.failed + batch.summary.skipped) / batch.totalEvents) * 100)
    : 0

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--s-bg)',
          border: '1px solid var(--s-border)',
          borderRadius: 'var(--s-r)',
          maxWidth: 800,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--s-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{
                fontFamily: 'var(--s-mono)',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--s-text)',
              }}>
                {t('stellar.batch.title')}
              </span>
              <span style={{
                fontFamily: 'var(--s-mono)',
                fontSize: 11,
                color: 'var(--s-text-muted)',
                background: 'var(--s-surface-2)',
                padding: '2px 8px',
                borderRadius: 'var(--s-rs)',
              }}>
                {new Date(batchTimestamp).toLocaleString()}
              </span>
              <div style={{
                fontFamily: 'var(--s-mono)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: batch.status === 'completed' ? 'var(--s-success)' 
                  : batch.status === 'failed' ? 'var(--s-warning)' 
                  : 'var(--s-info)',
                background: batch.status === 'completed' ? 'rgba(63,185,80,0.12)' 
                  : batch.status === 'failed' ? 'rgba(227,179,65,0.12)' 
                  : 'rgba(99,150,237,0.12)',
                border: `1px solid ${batch.status === 'completed' ? 'rgba(63,185,80,0.3)' 
                  : batch.status === 'failed' ? 'rgba(227,179,65,0.3)' 
                  : 'rgba(99,150,237,0.3)'}`,
                borderRadius: 10,
                padding: '2px 8px',
              }}>
                {batch.status === 'in_progress' ? t('stellar.batch.statusInProgress') 
                  : batch.status === 'completed' ? t('stellar.batch.statusCompleted') 
                  : t('stellar.batch.statusFailed')}
              </div>
            </div>
            <div style={{
              fontFamily: 'var(--s-mono)',
              fontSize: 11,
              color: 'var(--s-text-dim)',
            }}>
              {t('stellar.batch.elapsed')}: {formatElapsed(elapsed)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              color: 'var(--s-text-dim)',
              padding: 4,
              lineHeight: 1,
            }}
            title={t('actions.close')}
          >
            ✕
          </button>
        </div>

        {/* Summary */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--s-border)',
          background: 'var(--s-surface-1)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 12,
          }}>
            <span style={{
              fontFamily: 'var(--s-mono)',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--s-text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              {t('stellar.batch.summary')}
            </span>
            <span style={{
              fontFamily: 'var(--s-mono)',
              fontSize: 11,
              color: 'var(--s-text)',
            }}>
              {batch.totalEvents} {t('stellar.batch.events', { count: batch.totalEvents })}
            </span>
          </div>

          {/* Progress bar */}
          <div style={{
            width: '100%',
            height: 8,
            background: 'var(--s-surface-2)',
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 12,
          }}>
            <div style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: batch.status === 'completed' && batch.summary.failed === 0
                ? 'var(--s-success)'
                : batch.summary.failed > 0
                ? 'var(--s-warning)'
                : 'var(--s-info)',
              transition: 'width 0.3s ease',
            }} />
          </div>

          {/* Breakdown */}
          <div style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
          }}>
            {batch.summary.resolved > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--s-success)', fontSize: 14 }}>✓</span>
                <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-text)' }}>
                  {batch.summary.resolved} {t('stellar.batch.resolved')}
                </span>
              </div>
            )}
            {batch.summary.failed > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--s-critical)', fontSize: 14 }}>✗</span>
                <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-text)' }}>
                  {batch.summary.failed} {t('stellar.batch.failed')}
                </span>
              </div>
            )}
            {batch.summary.skipped > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--s-text-muted)', fontSize: 14 }}>–</span>
                <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-text)' }}>
                  {batch.summary.skipped} {t('stellar.batch.skipped')}
                </span>
              </div>
            )}
            {batch.summary.inProgress > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--s-info)', fontSize: 14 }}>⊙</span>
                <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-text)' }}>
                  {batch.summary.inProgress} {t('stellar.batch.inProgress')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Event list */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 20px',
        }} className="s-scroll">
          {batch.events.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 40,
              color: 'var(--s-text-dim)',
            }}>
              <span style={{ fontSize: 24, opacity: 0.4 }}>✦</span>
              <span style={{ fontSize: 12 }}>{t('stellar.batch.noEvents')}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {batch.events.map(event => (
                <div
                  key={event.id}
                  style={{
                    border: '1px solid var(--s-border)',
                    borderRadius: 'var(--s-rs)',
                    padding: '10px 12px',
                    background: event.status === 'in_progress' 
                      ? 'rgba(99,150,237,0.05)' 
                      : 'var(--s-surface-1)',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontSize: 14,
                      color: getStatusColor(event.status),
                      flexShrink: 0,
                      ...(event.status === 'in_progress' && {
                        animation: 'spin 2s linear infinite',
                      }),
                    }}>
                      {getStatusIcon(event.status)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--s-text)',
                        marginBottom: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {event.name}
                      </div>
                      {event.step && (
                        <div style={{
                          fontFamily: 'var(--s-mono)',
                          fontSize: 10,
                          color: 'var(--s-text-muted)',
                          fontStyle: 'italic',
                        }}>
                          {event.step}
                        </div>
                      )}
                      {event.failureReason && (
                        <div style={{
                          fontSize: 10,
                          color: 'var(--s-critical)',
                          marginTop: 4,
                        }}>
                          {event.failureReason}
                        </div>
                      )}
                    </div>
                    <div style={{
                      fontFamily: 'var(--s-mono)',
                      fontSize: 10,
                      color: 'var(--s-text-dim)',
                      flexShrink: 0,
                    }}>
                      {formatElapsed(event.durationSeconds)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
