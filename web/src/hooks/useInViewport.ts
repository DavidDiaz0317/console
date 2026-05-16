import { useEffect, useRef, useState } from 'react'

/**
 * Root margin for IntersectionObserver in viewport detection.
 * Cards within this margin of the viewport are pre-loaded for smooth scrolling.
 */
const LAZY_MOUNT_ROOT_MARGIN = '200px'

/**
 * Hook that detects when an element is near or within the viewport using
 * IntersectionObserver. Once an element has been seen, it stays mounted
 * (no unmount on scroll away) to preserve state and dnd-kit compatibility.
 *
 * @param options - Optional IntersectionObserver configuration
 * @returns [ref, hasBeenInViewport] - Ref to attach to the element and a boolean indicating if it has ever been in viewport
 */
export function useInViewport<T extends Element = HTMLDivElement>(
  options?: IntersectionObserverInit,
): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [hasBeenInViewport, setHasBeenInViewport] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Once mounted, stay mounted
    if (hasBeenInViewport) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasBeenInViewport(true)
        }
      },
      {
        rootMargin: LAZY_MOUNT_ROOT_MARGIN,
        ...options,
      },
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [hasBeenInViewport, options])

  return [ref, hasBeenInViewport]
}
