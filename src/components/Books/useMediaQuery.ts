import { useEffect, useState } from 'react';

const query = (q: string) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(q).matches
    : false;

// Tracks a CSS media query; false where matchMedia is unavailable (tests, SSR).
export const useMediaQuery = (q: string): boolean => {
  const [matches, setMatches] = useState(() => query(q));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(q);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [q]);

  return matches;
};

export const prefersReducedMotion = () => query('(prefers-reduced-motion: reduce)');
