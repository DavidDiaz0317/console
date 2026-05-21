import { MS_PER_MINUTE } from '../../lib/constants/time'

export interface TimePoint {
  time: string
  timestamp: number
  warnings: number
  normal: number
  total: number
}

export interface EventTimelineDatum {
  type: string
  cluster?: string
  lastSeen?: string
  firstSeen?: string
  count?: number | string
}

function getEventCount(count?: number | string): number {
  const numericCount = Number(count)
  return Number.isFinite(numericCount) && numericCount > 0 ? numericCount : 1
}

export function groupEventsByTime(events: EventTimelineDatum[], bucketMinutes = 5, numBuckets = 12): TimePoint[] {
  const now = Date.now()
  const bucketMs = bucketMinutes * MS_PER_MINUTE
  const buckets: TimePoint[] = []

  for (let i = numBuckets - 1; i >= 0; i--) {
    const bucketTime = now - (i * bucketMs)
    const date = new Date(bucketTime)
    buckets.push({
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: bucketTime,
      warnings: 0,
      normal: 0,
      total: 0,
    })
  }

  for (const event of events || []) {
    const eventTime = event.lastSeen ? new Date(event.lastSeen).getTime()
      : event.firstSeen ? new Date(event.firstSeen).getTime()
      : now
    const eventCount = getEventCount(event.count)

    for (let i = 0; i < buckets.length; i++) {
      const bucketStart = buckets[i].timestamp - bucketMs
      const bucketEnd = buckets[i].timestamp

      if (eventTime >= bucketStart && eventTime < bucketEnd) {
        if (event.type === 'Warning') {
          buckets[i].warnings += eventCount
        } else {
          buckets[i].normal += eventCount
        }
        buckets[i].total += eventCount
        break
      }
    }
  }

  return buckets
}
