import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, isJWTExpired } from '@/lib/auth'
import { DEMO_TOKEN_VALUE } from '@/lib/constants'
import { ROUTES } from '@/config/routes'
import { safeGet, safeSet } from '@/lib/safeLocalStorage'
import { STORAGE_KEY_TOKEN } from '@/lib/constants'

/** Key for preserving the intended destination through the OAuth login flow */
const RETURN_TO_KEY = 'kubestellar-return-to'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    // #6058 — Optimistically render only when the token in localStorage is
    // either the demo sentinel or a JWT that's still within its exp window.
    // If the token is expired, showing protected children would leak content
    // to an unauthenticated user during the brief refreshUser() window. In
    // that case render nothing (a spinner placeholder) until auth resolves.
    const storedToken = safeGet(STORAGE_KEY_TOKEN)
    if (storedToken && (storedToken === DEMO_TOKEN_VALUE || !isJWTExpired(storedToken))) {
      return <>{children}</>
    }
    return null
  }

  if (!isAuthenticated) {
    // Save the intended destination so AuthCallback can return here after login.
    // This preserves deep-link params like ?mission= through the OAuth round-trip.
    const destination = location.pathname + location.search
    if (destination !== ROUTES.HOME && destination !== ROUTES.LOGIN) {
      safeSet(RETURN_TO_KEY, destination)
    }
    return <Navigate to={ROUTES.LOGIN} replace />
  }

  return <>{children}</>
}
