import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedItemsList } from '../FeedItemsList'
import type { FeedItem, FeedConfig } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

vi.mock('../RSSParser', () => ({
  normalizeRedditLink: (link: string) => link,
  stripHTML: (html: string) => html,
  decodeHTMLEntities: (html: string) => html,
}))

vi.mock('../../../../lib/formatters', () => ({
  formatTimeAgo: (date: Date) => '2 hours ago',
}))

describe('FeedItemsList', () => {
  const mockFeedItem: FeedItem = {
    id: 'item-1',
    title: 'Test Article Title',
    link: 'https://example.com/article',
    description: 'This is a test article description',
    pubDate: new Date(),
    author: 'John Doe',
    sourceName: 'Example Blog',
    sourceIcon: '📰',
  }

  const mockActiveFeed: FeedConfig = {
    url: 'http://example.com/feed',
    name: 'Example Feed',
    icon: '📰',
  }

  const defaultProps = {
    paginatedItems: [mockFeedItem],
    totalItems: 1,
    showListSkeleton: false,
    activeFeed: mockActiveFeed,
    isRedditFeed: false,
    hasSearchOrFilter: false,
    onClearFilters: vi.fn(),
  }

  it('renders feed items list', () => {
    render(<FeedItemsList {...defaultProps} />)
    expect(screen.getByText('Test Article Title')).toBeInTheDocument()
  })

  it('shows loading skeleton when showListSkeleton is true', () => {
    render(
      <FeedItemsList
        {...defaultProps}
        showListSkeleton={true}
        paginatedItems={[]}
        totalItems={0}
      />
    )
    expect(screen.getAllByText(/^$/m).length).toBeGreaterThan(0)
  })

  it('shows empty state when no items and no search/filter', () => {
    render(
      <FeedItemsList
        {...defaultProps}
        paginatedItems={[]}
        totalItems={0}
      />
    )
    expect(screen.getByText(/cards:rssFeed.noItemsInFeed/)).toBeInTheDocument()
  })

  it('shows no matching items message when search/filter applied but no results', () => {
    render(
      <FeedItemsList
        {...defaultProps}
        paginatedItems={[]}
        totalItems={0}
        hasSearchOrFilter={true}
      />
    )
    expect(screen.getByText(/cards:rssFeed.noMatchingItems/)).toBeInTheDocument()
  })

  it('shows clear filters button when search/filter applied', async () => {
    const user = userEvent.setup()
    const onClearFilters = vi.fn()
    render(
      <FeedItemsList
        {...defaultProps}
        paginatedItems={[]}
        totalItems={0}
        hasSearchOrFilter={true}
        onClearFilters={onClearFilters}
      />
    )

    const clearButton = screen.getByRole('button', { name: /common:common.clearFilters/ })
    await user.click(clearButton)
    expect(onClearFilters).toHaveBeenCalled()
  })

  it('renders item links with correct href', () => {
    render(<FeedItemsList {...defaultProps} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://example.com/article')
  })

  it('renders item with thumbnail when available and valid URL', () => {
    const itemWithThumbnail: FeedItem = {
      ...mockFeedItem,
      thumbnail: 'https://example.com/image.jpg',
    }
    render(
      <FeedItemsList
        {...defaultProps}
        paginatedItems={[itemWithThumbnail]}
      />
    )
    const img = screen.getByAltText(/Feed thumbnail|Test Article Title/)
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/image.jpg')
  })

  it('renders multiple items', () => {
    const items: FeedItem[] = [
      mockFeedItem,
      { ...mockFeedItem, id: 'item-2', title: 'Second Article' },
      { ...mockFeedItem, id: 'item-3', title: 'Third Article' },
    ]
    render(
      <FeedItemsList
        {...defaultProps}
        paginatedItems={items}
        totalItems={3}
      />
    )
    expect(screen.getByText('Test Article Title')).toBeInTheDocument()
    expect(screen.getByText('Second Article')).toBeInTheDocument()
    expect(screen.getByText('Third Article')).toBeInTheDocument()
  })

  it('displays feed icon and name from active feed', () => {
    render(<FeedItemsList {...defaultProps} />)
    expect(screen.getByText('📰')).toBeInTheDocument()
  })

  it('displays article metadata (author, source, date)', () => {
    render(<FeedItemsList {...defaultProps} />)
    expect(screen.getByText('2 hours ago')).toBeInTheDocument()
  })

  it('handles items with score/upvote count for Reddit', () => {
    const redditItem: FeedItem = {
      ...mockFeedItem,
      score: 42,
      subreddit: 'kubernetes',
    }
    render(
      <FeedItemsList
        {...defaultProps}
        paginatedItems={[redditItem]}
        isRedditFeed={true}
      />
    )
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders items as links opening in new tab', () => {
    render(<FeedItemsList {...defaultProps} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('handles undefined active feed', () => {
    render(
      <FeedItemsList
        {...defaultProps}
        activeFeed={undefined}
      />
    )
    expect(screen.getByText('Test Article Title')).toBeInTheDocument()
  })

  it('renders aggregate feed source name and icon when applicable', () => {
    const aggregateFeed: FeedConfig = {
      ...mockActiveFeed,
      isAggregate: true,
      sourceUrls: ['feed1', 'feed2'],
    }
    render(
      <FeedItemsList
        {...defaultProps}
        activeFeed={aggregateFeed}
      />
    )
    expect(screen.getByText('Test Article Title')).toBeInTheDocument()
  })

  it('memoizes component to prevent unnecessary re-renders', () => {
    const { rerender } = render(<FeedItemsList {...defaultProps} />)
    expect(screen.getByText('Test Article Title')).toBeInTheDocument()
    
    rerender(
      <FeedItemsList
        {...defaultProps}
        paginatedItems={[mockFeedItem]}
      />
    )
    expect(screen.getByText('Test Article Title')).toBeInTheDocument()
  })

  it('handles empty paginatedItems array', () => {
    render(
      <FeedItemsList
        {...defaultProps}
        paginatedItems={[]}
        totalItems={0}
      />
    )
    expect(screen.getByText(/cards:rssFeed.noItemsInFeed/)).toBeInTheDocument()
  })

  it('displays total item count in empty state', () => {
    render(
      <FeedItemsList
        {...defaultProps}
        paginatedItems={[]}
        totalItems={0}
        hasSearchOrFilter={false}
      />
    )
    expect(screen.getByText(/cards:rssFeed.noItemsInFeed/)).toBeInTheDocument()
  })
})
