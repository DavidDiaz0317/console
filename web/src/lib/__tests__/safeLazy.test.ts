import { describe, it, expect } from 'vitest'
import { safeLazy } from '../safeLazy'

type LazyInternal = { _payload: { _result: () => Promise<unknown> } }

describe('safeLazy', () => {
  it('returns a lazy component', () => {
    const LazyComp = safeLazy(
      () => Promise.resolve({ TestComp: () => null }),
      'TestComp',
    )
    expect(LazyComp).toBeDefined()
    expect(typeof LazyComp).toBe('object') // React.lazy returns an object
  })

  it('throws descriptive error when module is null', async () => {
    const LazyComp = safeLazy(
      () => Promise.resolve(null as unknown as Record<string, unknown>),
      'Foo',
    )

    try {
      // Access the internal loader
      const loader = (LazyComp as unknown as LazyInternal)._payload._result
      await loader()
      expect.fail('should have thrown')
    } catch (e: unknown) {
      expect((e as Error).message).toContain('chunk may be stale')
    }
  })

  it('throws descriptive error when export is missing', async () => {
    const LazyComp = safeLazy(
      () => Promise.resolve({ OtherExport: () => null }),
      'MissingExport',
    )

    try {
      const loader = (LazyComp as unknown as LazyInternal)._payload._result
      await loader()
      expect.fail('should have thrown')
    } catch (e: unknown) {
      expect((e as Error).message).toContain('MissingExport')
      expect((e as Error).message).toContain('chunk may be stale')
    }
  })

  it('wraps import rejection as a recognizable chunk-load error', async () => {
    const LazyComp = safeLazy(
      () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
      'Foo',
    )

    try {
      const loader = (LazyComp as unknown as LazyInternal)._payload._result
      await loader()
      expect.fail('should have thrown')
    } catch (e: unknown) {
      expect((e as Error).message).toContain('chunk may be stale')
      expect((e as Error).message).toContain('Failed to fetch dynamically imported module')
    }
  })

  it('wraps non-chunk-load network errors as recognizable chunk errors', async () => {
    const LazyComp = safeLazy(
      () => Promise.reject(new Error('net::ERR_CONNECTION_REFUSED')),
      'Foo',
    )

    try {
      const loader = (LazyComp as unknown as LazyInternal)._payload._result
      await loader()
      expect.fail('should have thrown')
    } catch (e: unknown) {
      expect((e as Error).message).toContain('chunk may be stale')
      expect((e as Error).message).toContain('ERR_CONNECTION_REFUSED')
    }
  })
})
