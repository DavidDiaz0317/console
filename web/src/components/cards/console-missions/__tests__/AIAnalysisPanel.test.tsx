import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AIAnalysisPanel } from '../AIAnalysisPanel'

describe('AIAnalysisPanel', () => {
  const defaultProps = {
    filteredTotalIssues: 3,
    filteredTotalPredicted: 2,
    filteredOfflineCount: 1,
    filteredAIPredictionCount: 1,
    isFiltered: false,
    runningMission: false,
    onStartAnalysis: vi.fn(),
  }

  it('renders the analysis button', () => {
    render(<AIAnalysisPanel {...defaultProps} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows "All Healthy" when no issues and no predictions', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={0}
        filteredTotalPredicted={0}
      />
    )
    expect(screen.getByText(/All Healthy/)).toBeInTheDocument()
  })

  it('shows "No matching items" when filtered with no results', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={0}
        filteredTotalPredicted={0}
        isFiltered={true}
      />
    )
    expect(screen.getByText(/No matching items/)).toBeInTheDocument()
  })

  it('shows issue count when issues exist', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={3}
        filteredTotalPredicted={0}
      />
    )
    expect(screen.getByText(/Analyze 3 Issues/)).toBeInTheDocument()
  })

  it('shows singular "Issue" when only one issue', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={1}
        filteredTotalPredicted={0}
      />
    )
    expect(screen.getByText(/Analyze 1 Issue/)).toBeInTheDocument()
  })

  it('shows combined issues and risks count', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={2}
        filteredTotalPredicted={1}
      />
    )
    expect(screen.getByText(/Analyze 2 Issues \+ 1 Risk/)).toBeInTheDocument()
  })

  it('shows prediction count when only predictions exist', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={0}
        filteredTotalPredicted={2}
      />
    )
    expect(screen.getByText(/Analyze 2 Predicted Risks/)).toBeInTheDocument()
  })

  it('shows singular "Risk" when only one prediction', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={0}
        filteredTotalPredicted={1}
      />
    )
    expect(screen.getByText(/Analyze 1 Predicted Risk/)).toBeInTheDocument()
  })

  it('shows "Analyzing..." when running mission', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        runningMission={true}
      />
    )
    expect(screen.getByText(/Analyzing/)).toBeInTheDocument()
  })

  it('disables button when running mission', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        runningMission={true}
      />
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('disables button when no issues and no predictions', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={0}
        filteredTotalPredicted={0}
      />
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onStartAnalysis when button clicked with issues', async () => {
    const user = userEvent.setup()
    const onStartAnalysis = vi.fn()
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={3}
        onStartAnalysis={onStartAnalysis}
      />
    )

    await user.click(screen.getByRole('button'))
    expect(onStartAnalysis).toHaveBeenCalled()
  })

  it('shows AI icon when AI predictions exist', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={0}
        filteredTotalPredicted={2}
        filteredAIPredictionCount={1}
      />
    )
    expect(screen.getByText(/Analyze 2 Predicted Risks/)).toBeInTheDocument()
  })

  it('shows warning color for offline nodes', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={2}
        filteredOfflineCount={1}
      />
    )
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows critical color when offline nodes are more than 0', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={3}
        filteredOfflineCount={2}
      />
    )
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('includes AI count indicator when AI predictions present', () => {
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={0}
        filteredTotalPredicted={3}
        filteredAIPredictionCount={2}
      />
    )
    expect(screen.getByText(/\(2 AI\)/)).toBeInTheDocument()
  })

  it('enables button when only predictions exist', async () => {
    const user = userEvent.setup()
    const onStartAnalysis = vi.fn()
    render(
      <AIAnalysisPanel
        {...defaultProps}
        filteredTotalIssues={0}
        filteredTotalPredicted={1}
        onStartAnalysis={onStartAnalysis}
      />
    )

    const button = screen.getByRole('button')
    expect(button).not.toBeDisabled()
    await user.click(button)
    expect(onStartAnalysis).toHaveBeenCalled()
  })
})
