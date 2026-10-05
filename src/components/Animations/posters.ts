import { type FilmMeta, loadFilm } from './films';
import { createPress, type Press } from './riso/engine';

/**
 * Gallery cards: each film's code is fetched, then its poster frame is printed once on a shared
 * offscreen press and kept as a JPEG data URL. Jobs run one at a time on idle time so the page never stalls.
 */

const WIDTH = 640;
const cache = new Map<string, Promise<string | null>>();
let press: Press | null = null;
let queue: Promise<unknown> = Promise.resolve();

const idle = () =>
  new Promise<void>((resolve) => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (ric) ric(() => resolve(), { timeout: 400 });
    else window.setTimeout(resolve, 16);
  });

export const getPoster = (meta: FilmMeta): Promise<string | null> => {
  const hit = cache.get(meta.id);
  if (hit) return hit;
  const job = queue.then(async () => {
    await idle();
    try {
      const film = await loadFilm(meta);
      if (!press) {
        press = createPress(document.createElement('canvas'), { maxWidth: WIDTH });
        press.resize(WIDTH, (WIDTH * 9) / 16, 1);
      }
      press.render(film, film.posterTime ?? film.duration * 0.3);
      return press.canvas.toDataURL('image/jpeg', 0.86);
    } catch (err) {
      console.error(`Poster for "${meta.id}" failed`, err);
      return null;
    }
  });
  queue = job;
  cache.set(meta.id, job);
  return job;
};
