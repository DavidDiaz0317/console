import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const STORAGE_KEY = 'kubestellar-nav-history'
const MAX_HISTORY = 100

export function useNavigationHistory() {
  const location = useLocation()

  useEffect(() => {
    // Don't track auth-related pages
    if (location.pathname.startsWith('/auth') || location.pathname === '/login') {
      return
    }

    // Get existing history
    let existingHistory: string[] = []
    try {
      existingHistory = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    } catch {
      // Corrupted data — reset
    }

    // Add current path to history
    const newHistory = [location.pathname, ...existingHistory].slice(0, MAX_HISTORY)

    // Save back to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory))
  }, [location.pathname])
}
