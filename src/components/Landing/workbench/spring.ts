// A damped spring sampled into a CSS linear() easing, so WAAPI gets real spring motion
// without a library. Falls back to an overshooting bezier where linear() is unsupported.
const sample = (stiffness: number, damping: number, points: number) => {
  const mass = 1;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const at = (t: number) =>
    1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  // settle time for the envelope to fall under 0.1%
  const settle = -Math.log(0.001) / (zeta * w0);
  const values = Array.from({ length: points + 1 }, (_, i) => at((i / points) * settle));
  values[points] = 1;
  return { values, duration: Math.round(settle * 1000) };
};

let cached: { easing: string; duration: number } | undefined;

export const springEasing = () => {
  if (cached) return cached;
  const { values, duration } = sample(170, 20, 48);
  const supported = typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)');
  cached = supported
    ? { easing: `linear(${values.map((v) => +v.toFixed(4)).join(', ')})`, duration: Math.min(duration, 900) }
    : { easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', duration: 560 };
  return cached;
};

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
