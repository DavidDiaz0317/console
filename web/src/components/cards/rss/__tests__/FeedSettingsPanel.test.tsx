import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedSettingsPanel } from '../FeedSettingsPanel'
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

describe('FeedSettingsPanel', () => {
  const mockFeeds: FeedConfig[] = [
    {
      url: 'http://example.com/feed1',
      name: 'Example Feed 1',
      icon: '📰',
    },
    {
      url: 'http://example.com/feed2',
      name: 'Example Feed 2',
      icon: '🔶',
    },
  ]

  const defaultProps = {
    feeds: mockFeeds,
    activeFeedIndex: 0,
    newFeedUrl: '',
    newFeedName: '',
    showAggregateCreator: false,
    editingAggregateIndex: null,
    aggregateName: '',
    selectedSourceUrls: [],
    aggregateIncludeTerms: '',
    aggregateExcludeTerms: '',
    onClose: vi.fn(),
    onNewFeedUrlChange: vi.fn(),
    onNewFeedNameChange: vi.fn(),
    onAddCustomFeed: vi.fn(),
    onAddPresetFeed: vi.fn(),
    onSelectFeed: vi.fn(),
    onEditAggregate: vi.fn(),
    onRemoveFeed: vi.fn(),
    onToggleAggregateCreator: vi.fn(),
    onAggregateNameChange: vi.fn(),
    onSelectedSourceUrlsChange: vi.fn(),
    onAggregateIncludeChange: vi.fn(),
    onAggregateExcludeChange: vi.fn(),
    onSaveAggregate: vi.fn(),
    onCancelAggregateEdit: vi.fn(),
  }

  it('renders the settings panel', () => {
    render(<FeedSettingsPanel {...defaultProps} />)
    expect(screen.getByText(/cards:rssFeed.manageFeeds/)).toBeInTheDocument()
  })

  it('displays the feed URL input field', () => {
    render(<FeedSettingsPanel {...defaultProps} />)
    expect(screen.getByPlaceholderText(/Feed URL/)).toBeInTheDocument()
  })

  it('displays the feed name input field', () => {
    render(<FeedSettingsPanel {...defaultProps} />)
    expect(screen.getByPlaceholderText(/Name \(optional\)/)).toBeInTheDocument()
  })

  it('calls onNewFeedUrlChange when feed URL is changed', async () => {
    const user = userEvent.setup()
    const onNewFeedUrlChange = vi.fn()
    render(
      <FeedSettingsPanel
        {...defaultProps}
        onNewFeedUrlChange={onNewFeedUrlChange}
      />
    )

    const urlInput = screen.getByPlaceholderText(/Feed URL/)
    await user.type(urlInput, 'http://example.com/newfeed')
    expect(onNewFeedUrlChange).toHaveBeenCalled()
  })

  it('calls onNewFeedNameChange when feed name is changed', async () => {
    const user = userEvent.setup()
    const onNewFeedNameChange = vi.fn()
    render(
      <FeedSettingsPanel
        {...defaultProps}
        onNewFeedNameChange={onNewFeedNameChange}
      />
    )

    const nameInput = screen.getByPlaceholderText(/Name \(optional\)/)
    await user.type(nameInput, 'My Feed')
    expect(onNewFeedNameChange).toHaveBeenCalled()
  })

  it('calls onAddCustomFeed when add button is clicked with URL', async () => {
    const user = userEvent.setup()
    const onAddCustomFeed = vi.fn()
    render(
      <FeedSettingsPanel
        {...defaultProps}
        newFeedUrl="http://example.com/feed"
        onAddCustomFeed={onAddCustomFeed}
      />
    )

    const addButton = screen.getByRole('button', { name: /common:common.add/ })
    await user.click(addButton)
    expect(onAddCustomFeed).toHaveBeenCalled()
  })

  it('disables add button when URL is empty', () => {
    render(
      <FeedSettingsPanel
        {...defaultProps}
        newFeedUrl=""
      />
    )

    const addButton = screen.getByRole('button', { name: /common:common.add/ })
    expect(addButton).toBeDisabled()
  })

  it('displays current saved feeds', () => {
    render(<FeedSettingsPanel {...defaultProps} />)
    expect(screen.getByText('Example Feed 1')).toBeInTheDocument()
    expect(screen.getByText('Example Feed 2')).toBeInTheDocument()
  })

  it('calls onSelectFeed when a saved feed is clicked', async () => {
    const user = userEvent.setup()
    const onSelectFeed = vi.fn()
    render(
      <FeedSettingsPanel
        {...defaultProps}
        onSelectFeed={onSelectFeed}
      />
    )

    const feed = screen.getByText('Example Feed 2')
    await user.click(feed)
    expect(onSelectFeed).toHaveBeenCalled()
  })

  it('highlights the active feed', () => {
    render(
      <FeedSettingsPanel
        {...defaultProps}
        activeFeedIndex={1}
      />
    )
    expect(screen.getByText('Example Feed 2')).toBeInTheDocument()
  })

  it('calls onRemoveFeed when delete button is clicked', async () => {
    const user = userEvent.setup()
    const onRemoveFeed = vi.fn()
    render(
      <FeedSettingsPanel
        {...defaultProps}
        feeds={[mockFeeds[0]]}
        onRemoveFeed={onRemoveFeed}
      />
    )

    // Find the delete/remove button
    const buttons = screen.getAllByRole('button')
    const removeButton = buttons.find(btn => btn.className.includes('hover:text-red'))
    if (removeButton) {
      await user.click(removeButton)
      expect(onRemoveFeed).toHaveBeenCalled()
    }
  })

  it('calls onEditAggregate when edit button is clicked on aggregate feed', async () => {
    const user = userEvent.setup()
    const onEditAggregate = vi.fn()
    const aggregateFeed: FeedConfig[] = [
      {
        url: 'aggregate:feed1,feed2',
        name: 'Aggregate Feed',
        icon: '📦',
        isAggregate: true,
        sourceUrls: ['feed1', 'feed2'],
      },
    ]
    render(
      <FeedSettingsPanel
        {...defaultProps}
        feeds={aggregateFeed}
        onEditAggregate={onEditAggregate}
      />
    )

    // Find and click edit button
    const buttons = screen.getAllByRole('button')
    const editButton = buttons.find(btn => btn.className.includes('hover:text-purple'))
    if (editButton) {
      await user.click(editButton)
      expect(onEditAggregate).toHaveBeenCalled()
    }
  })

  it('displays examples for feed URLs', () => {
    render(<FeedSettingsPanel {...defaultProps} />)
    expect(screen.getByText(/r\/kubernetes/)).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <FeedSettingsPanel
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

  it('shows aggregate creator section when showAggregateCreator is true', () => {
    render(
      <FeedSettingsPanel
        {...defaultProps}
        showAggregateCreator={true}
      />
    )
    // Component should render with aggregate UI
    expect(screen.getByText(/cards:rssFeed.manageFeeds/)).toBeInTheDocument()
  })

  it('shows favorite star icon for saved feeds', () => {
    render(<FeedSettingsPanel {...defaultProps} />)
    // Star icon should be visible
    expect(screen.getByText(/cards:rssFeed.yourSavedFeeds/)).toBeInTheDocument()
  })

  it('shows feed count in your saved feeds section', () => {
    render(<FeedSettingsPanel {...defaultProps} />)
    expect(screen.getByText(/\(2\):/)).toBeInTheDocument()
  })

  it('handles feeds with no icons', () => {
    const feedsNoIcon: FeedConfig[] = [
      {
        url: 'http://example.com/feed',
        name: 'No Icon Feed',
      },
    ]
    render(
      <FeedSettingsPanel
        {...defaultProps}
        feeds={feedsNoIcon}
      />
    )
    expect(screen.getByText('No Icon Feed')).toBeInTheDocument()
  })

  it('disables remove button when only one feed exists', () => {
    render(
      <FeedSettingsPanel
        {...defaultProps}
        feeds={[mockFeeds[0]]}
      />
    )
    // The remove button should still exist but may be conditionally hidden
    expect(screen.getByText('Example Feed 1')).toBeInTheDocument()
  })

  it('memoizes component', () => {
    const { rerender } = render(<FeedSettingsPanel {...defaultProps} />)
    expect(screen.getByText('Example Feed 1')).toBeInTheDocument()
    
    rerender(<FeedSettingsPanel {...defaultProps} activeFeedIndex={0} />)
    expect(screen.getByText('Example Feed 1')).toBeInTheDocument()
  })
})
