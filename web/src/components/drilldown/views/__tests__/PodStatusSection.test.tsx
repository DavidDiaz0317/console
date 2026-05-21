import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PodStatusSection } from '../PodStatusSection'

describe('PodStatusSection', () => {
  it('switches between disconnected, loading, error, and output states', () => {
    const props = { podName: 'pod-1', namespace: 'ns-1', fetchingLabel: 'Fetching status' }
    const { container, rerender } = render(<PodStatusSection agentConnected={false} loading={false} error={null} output={null} {...props} />)
    expect(container.firstChild).toBeNull()
    rerender(<PodStatusSection agentConnected loading error={null} output={null} {...props} />)
    expect(screen.getByText('Fetching status')).toBeTruthy()
    rerender(<PodStatusSection agentConnected loading={false} error="boom" output={null} {...props} />)
    expect(screen.getByText('boom')).toBeTruthy()
    rerender(<PodStatusSection agentConnected loading={false} error={null} output="ready" {...props} />)
    expect(screen.getByText('# kubectl get pod pod-1 -n ns-1 -o wide')).toBeTruthy()
    expect(screen.getByText('ready')).toBeTruthy()
  })
})
