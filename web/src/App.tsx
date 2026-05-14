import { useMemo } from 'react'
import { Routes, Route, useLocation, useNavigationType } from 'react-router-dom'
import { BrandingProvider } from './hooks/useBranding'
import { ThemeProvider } from './hooks/useTheme'
import { useLiveUrl, LiveLocationProvider } from './components/app/LiveLocationProvider'
import { LightweightRoutes } from './components/app/AppRoutes'
import { DashboardRoutes } from './components/app/AppRoutes'
import { FullDashboardApp } from './components/app/AppProviders'
// Trigger chunk prefetch immediately (runs at module load time)
import './components/app/chunkPrefetch'

function App() {
  const liveUrl = useLiveUrl()
  // Merge the real router location (which carries state and — critically —
  // a real `key` that changes on every navigation) with the live browser URL.
  // This keeps pathname/search/hash in lockstep with the address bar while
  // preserving React Router's navigation metadata once it catches up.
  const routerLocation = useLocation()
  const navigationType = useNavigationType()
  const liveLocation = useMemo(() => {
    const url = new URL(liveUrl, window.location.origin)
    return {
      ...routerLocation,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    }
  }, [routerLocation, liveUrl])
  
  return (
    <BrandingProvider>
    <ThemeProvider>
    <LiveLocationProvider location={liveLocation} navigationType={navigationType}>
    <Routes location={liveLocation}>
      {/* Lightweight routes (missions, public pages) */}
      <LightweightRoutes />

      {/* Full dashboard routes with all providers */}
      <Route path="*" element={
        <FullDashboardApp liveLocation={liveLocation}>
          <DashboardRoutes />
        </FullDashboardApp>
      } />
    </Routes>
    </LiveLocationProvider>
    </ThemeProvider>
    </BrandingProvider>
  )
}

export default App
