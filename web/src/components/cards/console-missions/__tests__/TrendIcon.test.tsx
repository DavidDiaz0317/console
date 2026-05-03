import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrendIcon } from '../TrendIcon'
import type { TrendDirection } from '../../../../types/predictions'

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

describe('TrendIcon', () => {
  it('renders stable icon when trend is "stable"', () => {
    render(<TrendIcon trend="stable" />)
    expect(screen.getByTitle('Stable')).toBeInTheDocument()
  })

  it('renders stable icon when trend is undefined', () => {
    render(<TrendIcon trend={undefined} />)
    expect(screen.getByTitle('Stable')).toBeInTheDocument()
  })

  it('renders worsening icon when trend is "worsening"', () => {
    render(<TrendIcon trend="worsening" />)
    expect(screen.getByTitle('Worsening')).toBeInTheDocument()
  })

  it('renders improving icon when trend is "improving"', () => {
    render(<TrendIcon trend="improving" />)
    expect(screen.getByTitle('Improving')).toBeInTheDocument()
  })

  it('applies custom className to stable icon', () => {
    const { container } = render(<TrendIcon trend="stable" className="custom-class" />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('applies custom className to worsening icon', () => {
    const { container } = render(<TrendIcon trend="worsening" className="text-large" />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('applies custom className to improving icon', () => {
    const { container } = render(<TrendIcon trend="improving" className="text-large" />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders with correct color for worsening trend', () => {
    render(<TrendIcon trend="worsening" />)
    const icon = screen.getByTitle('Worsening')
    expect(icon).toBeInTheDocument()
  })

  it('renders with correct color for improving trend', () => {
    render(<TrendIcon trend="improving" />)
    const icon = screen.getByTitle('Improving')
    expect(icon).toBeInTheDocument()
  })

  it('renders muted color for stable trend', () => {
    render(<TrendIcon trend="stable" />)
    const icon = screen.getByTitle('Stable')
    expect(icon).toBeInTheDocument()
  })

  it('handles all trend direction types', () => {
    const trends: TrendDirection[] = ['stable', 'worsening', 'improving']
    trends.forEach(trend => {
      const { container } = render(<TrendIcon trend={trend} />)
      expect(container.firstChild).toBeInTheDocument()
    })
  })

  it('defaults to stable when trend is null', () => {
    render(<TrendIcon trend={null as any} />)
    expect(screen.getByTitle('Stable')).toBeInTheDocument()
  })

  it('renders small icon by default', () => {
    render(<TrendIcon trend="stable" />)
    expect(screen.getByTitle('Stable')).toBeInTheDocument()
  })

  it('maintains consistent sizing with className modification', () => {
    const { rerender } = render(<TrendIcon trend="worsening" />)
    expect(screen.getByTitle('Worsening')).toBeInTheDocument()

    rerender(<TrendIcon trend="improving" />)
    expect(screen.getByTitle('Improving')).toBeInTheDocument()
  })

  it('handles repeated renders with different trends', () => {
    const { rerender } = render(<TrendIcon trend="stable" />)
    expect(screen.getByTitle('Stable')).toBeInTheDocument()

    rerender(<TrendIcon trend="worsening" />)
    expect(screen.getByTitle('Worsening')).toBeInTheDocument()

    rerender(<TrendIcon trend="improving" />)
    expect(screen.getByTitle('Improving')).toBeInTheDocument()
  })

  it('renders without crashing with undefined className', () => {
    render(<TrendIcon trend="stable" className={undefined} />)
    expect(screen.getByTitle('Stable')).toBeInTheDocument()
  })

  it('renders without crashing with empty className', () => {
    render(<TrendIcon trend="stable" className="" />)
    expect(screen.getByTitle('Stable')).toBeInTheDocument()
  })
})
