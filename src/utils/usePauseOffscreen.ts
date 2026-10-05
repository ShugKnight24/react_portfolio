import { RefObject, useEffect } from 'react';

/**
 * Marks the element with `data-offscreen` while it is out of view. A global rule in
 * base.css pauses every CSS animation inside a marked element, so decorative loops
 * stop costing frames once they are scrolled away.
 */
export const usePauseOffscreen = (ref: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => el.toggleAttribute('data-offscreen', !entry.isIntersecting),
      { rootMargin: '100px 0px' }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      el.removeAttribute('data-offscreen');
    };
  }, [ref]);
};
