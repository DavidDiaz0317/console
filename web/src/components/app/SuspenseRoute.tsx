import { Suspense, useState, useEffect } from 'react'
import { PageErrorBoundary } from '@/components/PageErrorBoundary'

// Wrap lazy route elements in their own Suspense boundary so the route
// change is immediate. Without this, React 18's concurrent transitions
// keep the OLD route visible while the new lazy component loads.
export function SuspenseRoute({ children }: { children: React.ReactNode }) {
  return (
    <PageErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>{children}</Suspense>
    </PageErrorBoundary>
  )
}

// Timing constant (milliseconds)
const LOADING_FLASH_DELAY_MS = 200

// Loading fallback component with delay to prevent flash on fast navigation
function LoadingFallback() {
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    // Only show loading spinner if it takes more than LOADING_FLASH_DELAY_MS
    const timer = setTimeout(() => {
      setShowLoading(true)
    }, LOADING_FLASH_DELAY_MS)

    return () => clearTimeout(timer)
  }, [])

  if (!showLoading) {
    // Invisible placeholder maintains layout dimensions during route transitions,
    // preventing the content area from collapsing to 0 height (blank flash).
    return <div className="min-h-screen" />
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      {/* Full border with transparent sides enables GPU acceleration during rotation */}
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
    </div>
  )
}
