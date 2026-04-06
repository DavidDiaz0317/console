import { lazy, type ComponentType } from 'react'

/**
 * Safe wrapper around React.lazy() for named exports.
 *
 * The standard pattern `lazy(() => import('./Foo').then(m => ({ default: m.Foo })))`
 * crashes when a chunk loads stale content after a deploy — `m.Foo` becomes undefined
 * and React receives `{ default: undefined }`, causing "Cannot read properties of
 * undefined" errors.
 *
 * This helper throws a descriptive error that triggers the ChunkErrorBoundary's
 * auto-reload recovery instead of silently crashing.
 *
 * Additionally, if the dynamic import itself rejects (network failure, 404, etc.),
 * the error is re-wrapped so that isChunkLoadMessage() recognises it and
 * ChunkErrorBoundary triggers auto-reload rather than crashing the app.
 */
export function safeLazy<T extends Record<string, unknown>>(
  importFn: () => Promise<T>,
  exportName: keyof T & string,
): ReturnType<typeof lazy> {
  return lazy(() =>
    importFn()
      .catch((err: unknown) => {
        // When the dynamic import itself fails (network error, 404, etc.),
        // re-throw as a recognizable chunk-load error so ChunkErrorBoundary
        // triggers auto-reload recovery instead of crashing the app.
        const original = err instanceof Error ? err.message : String(err)
        throw new Error(
          `Dynamic import failed — chunk may be stale. ${original}`,
        )
      })
      .then((m) => {
        // When an eagerly-loaded bundle uses .catch(() => undefined) to suppress
        // unhandled rejections, a stale-chunk failure resolves the promise to
        // undefined instead of rejecting it. Without this guard, accessing
        // m[exportName] throws a generic TypeError that isChunkLoadMessage()
        // does not recognise, so ChunkErrorBoundary never triggers auto-reload.
        if (!m) {
          throw new Error(
            'Module failed to load — chunk may be stale. ' +
            'Reload the page to get the latest version.',
          )
        }
        const component = m[exportName]
        if (!component) {
          throw new Error(
            `Export "${exportName}" not found in module — chunk may be stale. ` +
            'Reload the page to get the latest version.',
          )
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { default: component as ComponentType<any> }
      }),
  )
}
