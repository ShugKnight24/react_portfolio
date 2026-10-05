import { useEffect, useState } from 'react';
import type { FunSceneMeta, SceneHandle, SceneOptions } from './scenes/types';

const query = '(prefers-reduced-motion: reduce)';

export const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
};

/**
 * Loads a scene module and mounts it into the container; disposes on change or unmount.
 * Returns the live handle (null while loading) so callers can pause, resume or mute.
 */
export const useSceneMount = (
  container: HTMLElement | null,
  scene: FunSceneMeta | undefined,
  opts: SceneOptions | null
) => {
  const [handle, setHandle] = useState<SceneHandle | null>(null);
  const reducedMotion = opts?.reducedMotion;
  const interactive = opts?.interactive;
  const enabled = !!opts;
  // Muted is applied live through setMuted, so it must not remount the scene
  const initialMuted = opts?.muted ?? true;

  useEffect(() => {
    if (!container || !scene || !enabled) return;
    let cancelled = false;
    let live: SceneHandle | null = null;
    scene
      .load()
      .then((mod) => {
        if (cancelled) return;
        live = mod.mount(container, {
          reducedMotion: !!reducedMotion,
          muted: initialMuted,
          interactive,
        });
        setHandle(live);
      })
      .catch((err: unknown) => {
        console.error(`Fun scene "${scene.id}" failed to load`, err);
      });
    return () => {
      cancelled = true;
      live?.dispose();
      setHandle(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, scene, enabled, reducedMotion, interactive]);

  return handle;
};
