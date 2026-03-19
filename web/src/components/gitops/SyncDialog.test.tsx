/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import '../../test/utils/setupMocks'

vi.mock('../../lib/modals', () => {
  type BaseModalWithSubComponents = React.FC<{ children: React.ReactNode }> & {
    Header: React.FC<{ title: string }>
    Content: React.FC<{ children: React.ReactNode }>
    Footer: React.FC<{ children: React.ReactNode }>
  }
  const BaseModal: BaseModalWithSubComponents = ({ children }) => <div data-testid='mock-base-modal'>{children}</div>
  BaseModal.Header = ({ title }) => <div>{title}</div>
  BaseModal.Content = ({ children }) => <div>{children}</div>
  BaseModal.Footer = ({ children }) => <div>{children}</div>
  return { BaseModal }
})

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn() },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { SyncDialog } from './SyncDialog'

describe('SyncDialog Component', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        })
      )
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    appName: 'test-app',
    namespace: 'default',
    cluster: 'test-cluster',
    repoUrl: 'https://github.com/test/repo',
    path: 'deploy/',
    onSyncComplete: vi.fn(),
  }

  it('renders without crashing when open', () => {
    expect(() =>
      render(<SyncDialog {...defaultProps} />)
    ).not.toThrow()
  })

  it('renders the app name in the dialog', () => {
    render(<SyncDialog {...defaultProps} />)
    expect(screen.getByText('GitOps Sync: test-app')).toBeInTheDocument()
  })

  it('renders loading state when fetch is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => { /* never resolves — simulates in-flight request */ }))
    )
    expect(() => render(<SyncDialog {...defaultProps} />)).not.toThrow()
  })

  it('renders gracefully when fetch returns an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Internal Server Error' }),
        })
      )
    )
    expect(() => render(<SyncDialog {...defaultProps} />)).not.toThrow()
  })
})
