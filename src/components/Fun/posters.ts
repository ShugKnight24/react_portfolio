import type { FunSceneMeta } from './scenes/types';

/**
 * Poster frames: each scene is mounted once in still mode into an offscreen box,
 * its canvas is copied to a JPEG data URL and the scene is disposed straight away.
 * Jobs run one at a time on idle time so the gallery never stalls.
 */

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

const idle = () =>
  new Promise<void>((resolve) => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: object) => number })
      .requestIdleCallback;
    if (ric) ric(() => resolve(), { timeout: 400 });
    else setTimeout(resolve, 16);
  });

const render = async (scene: FunSceneMeta, width: number, height: number) => {
  const mod = await scene.load();
  await idle();
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
    visibility: 'hidden',
  });
  document.body.appendChild(box);
  try {
    const handle = mod.mount(box, { reducedMotion: true, muted: true, interactive: false });
    const canvas = box.querySelector('canvas');
    const url = canvas && canvas.width > 1 ? canvas.toDataURL('image/jpeg', 0.86) : null;
    handle.dispose();
    return url;
  } finally {
    box.remove();
  }
};

export const getPoster = (scene: FunSceneMeta, width: number, height: number) => {
  const key = `${scene.id}@${width}x${height}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const job = queue
    .then(() => render(scene, width, height))
    .catch((err: unknown) => {
      console.error(`Poster for "${scene.id}" failed`, err);
      return null;
    })
    .then((url) => {
      pending.delete(key);
      if (url) cache.set(key, url);
      return url;
    });
  queue = job;
  pending.set(key, job);
  return job;
};
