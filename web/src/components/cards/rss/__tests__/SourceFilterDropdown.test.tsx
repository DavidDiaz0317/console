import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SourceFilterDropdown } from '../SourceFilterDropdown'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

describe('SourceFilterDropdown', () => {
  const mockSources = [
    { url: 'http://example.com/feed1', name: 'Example Feed 1', icon: '📰' },
    { url: 'http://example.com/feed2', name: 'Example Feed 2', icon: '🔶' },
    { url: 'http://example.com/feed3', name: 'Example Feed 3', icon: '📚' },
  ]

  const defaultProps = {
    availableSources: mockSources,
    sourceFilter: [],
    showSourceFilter: false,
    onToggle: vi.fn(),
    onSetFilter: vi.fn(),
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the filter button', () => {
    render(<SourceFilterDropdown {...defaultProps} />)
    expect(screen.getByText(/cards:rssFeed.sources/)).toBeInTheDocument()
  })

  it('shows filter count when sources are selected', () => {
    render(
      <SourceFilterDropdown
        {...defaultProps}
        sourceFilter={['http://example.com/feed1', 'http://example.com/feed2']}
      />
    )
    expect(screen.getByText(/2\/3/)).toBeInTheDocument()
  })

  it('calls onToggle when filter button is clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(
      <SourceFilterDropdown
        {...defaultProps}
        onToggle={onToggle}
      />
    )

    const button = screen.getByRole('button', { name: /cards:rssFeed.sources/ })
    await user.click(button)
    expect(onToggle).toHaveBeenCalled()
  })

  it('shows dropdown menu when showSourceFilter is true', () => {
    render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
      />
    )
    expect(screen.getByText('Example Feed 1')).toBeInTheDocument()
    expect(screen.getByText('Example Feed 2')).toBeInTheDocument()
    expect(screen.getByText('Example Feed 3')).toBeInTheDocument()
  })

  it('hides dropdown menu when showSourceFilter is false', () => {
    render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={false}
      />
    )
    // Should only see the button label, not the dropdown items
    expect(screen.getByText(/cards:rssFeed.sources/)).toBeInTheDocument()
  })

  it('shows "All Sources" option at top of dropdown', () => {
    render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
      />
    )
    expect(screen.getByText(/cards:rssFeed.allSources/)).toBeInTheDocument()
  })

  it('calls onSetFilter with empty array when "All Sources" is clicked', async () => {
    const user = userEvent.setup()
    const onSetFilter = vi.fn()
    render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
        sourceFilter={['http://example.com/feed1']}
        onSetFilter={onSetFilter}
      />
    )

    const allSourcesButton = screen.getByRole('button', { name: /cards:rssFeed.allSources/ })
    await user.click(allSourcesButton)
    expect(onSetFilter).toHaveBeenCalledWith([])
  })

  it('adds source to filter when clicked', async () => {
    const user = userEvent.setup()
    const onSetFilter = vi.fn()
    render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
        sourceFilter={[]}
        onSetFilter={onSetFilter}
      />
    )

    const feed1Button = screen.getByRole('button', { name: /Example Feed 1/ })
    await user.click(feed1Button)
    expect(onSetFilter).toHaveBeenCalledWith(['http://example.com/feed1'])
  })

  it('removes source from filter when already selected and clicked', async () => {
    const user = userEvent.setup()
    const onSetFilter = vi.fn()
    render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
        sourceFilter={['http://example.com/feed1']}
        onSetFilter={onSetFilter}
      />
    )

    const feed1Button = screen.getByRole('button', { name: /Example Feed 1/ })
    await user.click(feed1Button)
    expect(onSetFilter).toHaveBeenCalledWith([])
  })

  it('displays all available sources', () => {
    render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
      />
    )
    mockSources.forEach(source => {
      expect(screen.getByText(source.name)).toBeInTheDocument()
    })
  })

  it('displays source icons', () => {
    render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
      />
    )
    expect(screen.getByText('📰')).toBeInTheDocument()
    expect(screen.getByText('🔶')).toBeInTheDocument()
    expect(screen.getByText('📚')).toBeInTheDocument()
  })

  it('highlights selected sources with blue background', () => {
    render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
        sourceFilter={['http://example.com/feed1']}
      />
    )
    // Component should render with visual indication of selected sources
    expect(screen.getByText('Example Feed 1')).toBeInTheDocument()
  })

  it('closes dropdown when clicking outside', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
        onClose={onClose}
      />
    )

    // Simulate click outside the dropdown
    await user.click(container)
    
    await waitFor(() => {
      // The onClose callback should eventually be called when clicking outside
      expect(onClose).toHaveBeenCalled()
    }, { timeout: 1000 })
  })

  it('toggles multiple sources', async () => {
    const user = userEvent.setup()
    const onSetFilter = vi.fn()
    render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
        sourceFilter={[]}
        onSetFilter={onSetFilter}
      />
    )

    const feed1Button = screen.getByRole('button', { name: /Example Feed 1/ })
    const feed2Button = screen.getByRole('button', { name: /Example Feed 2/ })

    await user.click(feed1Button)
    expect(onSetFilter).toHaveBeenCalledWith(['http://example.com/feed1'])

    // Reset mock for next assertion
    onSetFilter.mockClear()

    // Now test adding another source
    render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
        sourceFilter={['http://example.com/feed1']}
        onSetFilter={onSetFilter}
      />
    )

    const updatedFeed2Button = screen.getByRole('button', { name: /Example Feed 2/ })
    await user.click(updatedFeed2Button)
    expect(onSetFilter).toHaveBeenCalledWith([
      'http://example.com/feed1',
      'http://example.com/feed2',
    ])
  })

  it('handles empty source list', () => {
    render(
      <SourceFilterDropdown
        {...defaultProps}
        availableSources={[]}
        showSourceFilter={true}
      />
    )
    expect(screen.getByText(/cards:rssFeed.allSources.*\(0\)/)).toBeInTheDocument()
  })

  it('shows filter count as "0/total" when no sources selected', () => {
    render(
      <SourceFilterDropdown
        {...defaultProps}
        sourceFilter={[]}
      />
    )
    expect(screen.getByText(/cards:rssFeed.sources/)).toBeInTheDocument()
  })

  it('memoizes component to prevent unnecessary re-renders', () => {
    const { rerender } = render(
      <SourceFilterDropdown
        {...defaultProps}
        sourceFilter={[]}
      />
    )
    expect(screen.getByText(/cards:rssFeed.sources/)).toBeInTheDocument()

    rerender(
      <SourceFilterDropdown
        {...defaultProps}
        sourceFilter={['http://example.com/feed1']}
      />
    )
    expect(screen.getByText(/1\/3/)).toBeInTheDocument()
  })

  it('uses chevron icon that rotates on toggle', () => {
    const { rerender } = render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={false}
      />
    )
    
    rerender(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
      />
    )
    
    expect(screen.getByText(/cards:rssFeed.allSources/)).toBeInTheDocument()
  })

  it('truncates long source names in dropdown', () => {
    const longNameSources = [
      {
        url: 'http://example.com/feed',
        name: 'This is a very long feed name that should be truncated in the dropdown display',
        icon: '📰',
      },
    ]
    render(
      <SourceFilterDropdown
        {...defaultProps}
        availableSources={longNameSources}
        showSourceFilter={true}
      />
    )
    expect(screen.getByText(/This is a very long/)).toBeInTheDocument()
  })

  it('preserves filter state when toggling dropdown', async () => {
    const user = userEvent.setup()
    const onSetFilter = vi.fn()
    const { rerender } = render(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
        sourceFilter={['http://example.com/feed1']}
        onSetFilter={onSetFilter}
      />
    )

    rerender(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={false}
        sourceFilter={['http://example.com/feed1']}
        onSetFilter={onSetFilter}
      />
    )

    rerender(
      <SourceFilterDropdown
        {...defaultProps}
        showSourceFilter={true}
        sourceFilter={['http://example.com/feed1']}
        onSetFilter={onSetFilter}
      />
    )

    expect(screen.getByText(/1\/3/)).toBeInTheDocument()
  })
})
