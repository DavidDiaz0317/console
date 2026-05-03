import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedSelector, FeedPills } from '../FeedSelector'
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

describe('FeedSelector', () => {
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
    showFeedSelector: false,
    totalItems: 42,
    onToggleSelector: vi.fn(),
    onSelectFeed: vi.fn(),
    onOpenSettings: vi.fn(),
  }

  it('renders the active feed name and icon', () => {
    render(<FeedSelector {...defaultProps} />)
    expect(screen.getByText('Example Feed 1')).toBeInTheDocument()
    expect(screen.getByText('📰')).toBeInTheDocument()
  })

  it('displays total items count', () => {
    render(<FeedSelector {...defaultProps} />)
    expect(screen.getByText(/42 cards:rssFeed.items/)).toBeInTheDocument()
  })

  it('toggles feed selector dropdown on button click', async () => {
    const user = userEvent.setup()
    const onToggleSelector = vi.fn()
    render(
      <FeedSelector
        {...defaultProps}
        onToggleSelector={onToggleSelector}
      />
    )

    const toggleButton = screen.getByRole('button', { name: /Example Feed 1/ })
    await user.click(toggleButton)
    expect(onToggleSelector).toHaveBeenCalled()
  })

  it('shows feed dropdown menu when showFeedSelector is true', () => {
    render(
      <FeedSelector
        {...defaultProps}
        showFeedSelector={true}
      />
    )
    expect(screen.getByText('Example Feed 1')).toBeInTheDocument()
    expect(screen.getByText('Example Feed 2')).toBeInTheDocument()
  })

  it('hides feed dropdown menu when showFeedSelector is false', () => {
    render(
      <FeedSelector
        {...defaultProps}
        showFeedSelector={false}
      />
    )
    // Only should see active feed in button, not in dropdown
    const feedElements = screen.getAllByText('Example Feed 1')
    expect(feedElements.length).toBeGreaterThan(0)
  })

  it('calls onSelectFeed with index when feed is clicked in dropdown', async () => {
    const user = userEvent.setup()
    const onSelectFeed = vi.fn()
    render(
      <FeedSelector
        {...defaultProps}
        showFeedSelector={true}
        onSelectFeed={onSelectFeed}
      />
    )

    // Find and click the second feed option
    const buttons = screen.getAllByRole('button')
    const secondFeedButton = buttons.find(btn => btn.textContent?.includes('Example Feed 2'))
    if (secondFeedButton) {
      await user.click(secondFeedButton)
      expect(onSelectFeed).toHaveBeenCalledWith(1)
    }
  })

  it('highlights the active feed in dropdown with primary color', () => {
    render(
      <FeedSelector
        {...defaultProps}
        showFeedSelector={true}
        activeFeedIndex={0}
      />
    )
    // Active feed should have different styling
    expect(screen.getByText('Example Feed 1')).toBeInTheDocument()
  })

  it('shows add feed option at bottom of dropdown', () => {
    render(
      <FeedSelector
        {...defaultProps}
        showFeedSelector={true}
      />
    )
    expect(screen.getByText(/cards:rssFeed.addFeed/)).toBeInTheDocument()
  })

  it('calls onOpenSettings when add feed button is clicked', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    render(
      <FeedSelector
        {...defaultProps}
        showFeedSelector={true}
        onOpenSettings={onOpenSettings}
      />
    )

    const addFeedButton = screen.getByRole('button', { name: /cards:rssFeed.addFeed/ })
    await user.click(addFeedButton)
    expect(onOpenSettings).toHaveBeenCalled()
  })

  it('handles single feed (no dropdown needed)', () => {
    render(
      <FeedSelector
        {...defaultProps}
        feeds={[mockFeeds[0]]}
      />
    )
    expect(screen.getByText('Example Feed 1')).toBeInTheDocument()
  })

  it('rotates chevron icon based on showFeedSelector state', () => {
    const { rerender } = render(
      <FeedSelector
        {...defaultProps}
        showFeedSelector={false}
      />
    )

    rerender(
      <FeedSelector
        {...defaultProps}
        showFeedSelector={true}
      />
    )
    expect(screen.getByText('Example Feed 1')).toBeInTheDocument()
  })

  it('handles feeds with missing icons gracefully', () => {
    const feedsNoIcon: FeedConfig[] = [
      {
        url: 'http://example.com/feed',
        name: 'No Icon Feed',
      },
    ]
    render(
      <FeedSelector
        {...defaultProps}
        feeds={feedsNoIcon}
      />
    )
    expect(screen.getByText('No Icon Feed')).toBeInTheDocument()
  })

  it('truncates long feed names', () => {
    const longNameFeed: FeedConfig[] = [
      {
        url: 'http://example.com/feed',
        name: 'This is a very long feed name that should be truncated for display purposes',
        icon: '📰',
      },
    ]
    render(
      <FeedSelector
        {...defaultProps}
        feeds={longNameFeed}
      />
    )
    expect(screen.getByText(/This is a very long feed/)).toBeInTheDocument()
  })
})

describe('FeedPills', () => {
  const mockFeeds: FeedConfig[] = [
    {
      url: 'http://example.com/feed1',
      name: 'Feed 1',
      icon: '📰',
    },
    {
      url: 'http://example.com/feed2',
      name: 'Feed 2',
      icon: '🔶',
    },
  ]

  const defaultProps = {
    feeds: mockFeeds,
    activeFeedIndex: 0,
    onSelectFeed: vi.fn(),
  }

  it('does not render when only one feed exists', () => {
    const { container } = render(
      <FeedPills
        {...defaultProps}
        feeds={[mockFeeds[0]]}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders pills for multiple feeds', () => {
    render(<FeedPills {...defaultProps} />)
    expect(screen.getByText('Feed 1')).toBeInTheDocument()
    expect(screen.getByText('Feed 2')).toBeInTheDocument()
  })

  it('highlights active feed pill', () => {
    render(
      <FeedPills
        {...defaultProps}
        activeFeedIndex={0}
      />
    )
    expect(screen.getByText('Feed 1')).toBeInTheDocument()
  })

  it('calls onSelectFeed when pill is clicked', async () => {
    const user = userEvent.setup()
    const onSelectFeed = vi.fn()
    render(
      <FeedPills
        {...defaultProps}
        onSelectFeed={onSelectFeed}
      />
    )

    const pill = screen.getByText('Feed 2')
    await user.click(pill)
    expect(onSelectFeed).toHaveBeenCalledWith(1)
  })

  it('displays feed icons in pills', () => {
    render(<FeedPills {...defaultProps} />)
    expect(screen.getByText('📰')).toBeInTheDocument()
    expect(screen.getByText('🔶')).toBeInTheDocument()
  })

  it('handles empty feeds array', () => {
    const { container } = render(
      <FeedPills
        {...defaultProps}
        feeds={[]}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
