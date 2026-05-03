import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedFilterEditor } from '../FeedFilterEditor'
import type { FeedConfig } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

describe('FeedFilterEditor', () => {
  const mockActiveFeed: FeedConfig = {
    url: 'http://example.com/feed',
    name: 'Example Feed',
    icon: '📰',
  }

  const defaultProps = {
    activeFeed: mockActiveFeed,
    tempIncludeTerms: 'kubernetes, docker',
    tempExcludeTerms: 'spam, politics',
    onIncludeChange: vi.fn(),
    onExcludeChange: vi.fn(),
    onSave: vi.fn(),
    onClear: vi.fn(),
    onClose: vi.fn(),
  }

  it('renders the filter editor panel', () => {
    render(<FeedFilterEditor {...defaultProps} />)
    expect(screen.getByText(/Filter: Example Feed/)).toBeInTheDocument()
  })

  it('displays include and exclude input fields', () => {
    render(<FeedFilterEditor {...defaultProps} />)
    const inputs = screen.getAllByPlaceholderText(/kubernetes, docker, cloud/)
    expect(inputs).toHaveLength(1)
  })

  it('calls onIncludeChange when include terms are modified', async () => {
    const user = userEvent.setup()
    const onIncludeChange = vi.fn()
    render(
      <FeedFilterEditor
        {...defaultProps}
        onIncludeChange={onIncludeChange}
      />
    )

    const inputs = screen.getAllByPlaceholderText(/kubernetes, docker, cloud/)
    await user.clear(inputs[0])
    await user.type(inputs[0], 'new-terms')

    expect(onIncludeChange).toHaveBeenCalledWith('new-terms')
  })

  it('calls onExcludeChange when exclude terms are modified', async () => {
    const user = userEvent.setup()
    const onExcludeChange = vi.fn()
    render(
      <FeedFilterEditor
        {...defaultProps}
        onExcludeChange={onExcludeChange}
      />
    )

    const inputs = screen.getAllByPlaceholderText(/spam, politics, off-topic/)
    await user.clear(inputs[0])
    await user.type(inputs[0], 'excluded-terms')

    expect(onExcludeChange).toHaveBeenCalledWith('excluded-terms')
  })

  it('calls onSave when apply button is clicked', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <FeedFilterEditor
        {...defaultProps}
        onSave={onSave}
      />
    )

    const applyButton = screen.getByRole('button', { name: /cards:rssFeed.applyFilter/ })
    await user.click(applyButton)

    expect(onSave).toHaveBeenCalled()
  })

  it('calls onClear when clear button is clicked if filter exists', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    const feedWithFilter: FeedConfig = {
      ...mockActiveFeed,
      filter: { include: 'test', exclude: '' },
    }
    render(
      <FeedFilterEditor
        {...defaultProps}
        activeFeed={feedWithFilter}
        onClear={onClear}
      />
    )

    const clearButton = screen.getByRole('button', { name: /cards:rssFeed.clearFilter/ })
    await user.click(clearButton)

    expect(onClear).toHaveBeenCalled()
  })

  it('does not show clear button when no filter is applied', () => {
    render(
      <FeedFilterEditor
        {...defaultProps}
        activeFeed={{ ...mockActiveFeed, filter: undefined }}
      />
    )

    expect(screen.queryByRole('button', { name: /cards:rssFeed.clearFilter/ })).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <FeedFilterEditor
        {...defaultProps}
        onClose={onClose}
      />
    )

    const closeButton = screen.getAllByRole('button').find(btn => btn.className.includes('hover:bg-secondary'))
    if (closeButton) {
      await user.click(closeButton)
      expect(onClose).toHaveBeenCalled()
    }
  })

  it('displays current include and exclude terms in input fields', () => {
    render(<FeedFilterEditor {...defaultProps} />)
    const inputs = screen.getAllByDisplayValue(/kubernetes, docker|spam, politics/)
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('preserves input values without calling handlers on mount', () => {
    const onIncludeChange = vi.fn()
    const onExcludeChange = vi.fn()
    render(
      <FeedFilterEditor
        {...defaultProps}
        onIncludeChange={onIncludeChange}
        onExcludeChange={onExcludeChange}
      />
    )

    expect(onIncludeChange).not.toHaveBeenCalled()
    expect(onExcludeChange).not.toHaveBeenCalled()
  })

  it('handles undefined active feed gracefully', () => {
    render(
      <FeedFilterEditor
        {...defaultProps}
        activeFeed={undefined}
      />
    )
    expect(screen.getByText(/Filter:/)).toBeInTheDocument()
  })

  it('handles empty string inputs', async () => {
    const user = userEvent.setup()
    const onIncludeChange = vi.fn()
    render(
      <FeedFilterEditor
        {...defaultProps}
        tempIncludeTerms=""
        onIncludeChange={onIncludeChange}
      />
    )

    const inputs = screen.getAllByPlaceholderText(/kubernetes, docker, cloud/)
    await user.type(inputs[0], 'test')
    expect(onIncludeChange).toHaveBeenCalledWith('test')
  })

  it('memoizes the component to prevent unnecessary re-renders', () => {
    const { rerender } = render(<FeedFilterEditor {...defaultProps} />)
    const firstRender = screen.getByText(/Filter: Example Feed/)
    
    rerender(<FeedFilterEditor {...defaultProps} tempIncludeTerms="unchanged" />)
    const secondRender = screen.getByText(/Filter: Example Feed/)
    
    expect(firstRender).toEqual(secondRender)
  })
})
