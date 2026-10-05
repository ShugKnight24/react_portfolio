// Pre-renders animation frames of a Look (both facings) into offscreen
// canvases once. Each animation is baked lazily the first time it is shown, so
// a new enemy costs only its idle/walk frames on spawn instead of every pose.
// The game loop only blits these.
import { createSurface, mirrorSurface, tintSurface } from './canvas';
import { WORLD_SCALE } from './constants';
import { AnimId, ANIMS, bakeFigure, bakePortrait, Look } from './rig';

export interface Frame {
  img: HTMLCanvasElement;
  /** feet anchor inside img */
  ax: number;
  ay: number;
  /** front hand inside img */
  hx: number;
  hy: number;
  /** pre-baked impact flash (hurt/fall/block frames); others tint at runtime */
  flash?: HTMLCanvasElement;
}

export type FrameTable = Record<AnimId, Frame[]>;

export interface SpriteSet {
  look: Look;
  right: FrameTable;
  left: FrameTable;
  /** approximate standing height in px (for HP bars / labels) */
  height: number;
  portrait: HTMLCanvasElement;
  ready: boolean;
}

const cache = new Map<string, SpriteSet>();
/** Animations shown while an actor flashes from a hit. */
const FLASH_ANIMS = new Set<AnimId>(['hurt', 'fall', 'block', 'held']);

/** Animations still to be baked, warmed a few per frame by warmSprites(). */
const pending: Array<() => void> = [];
const WARM_ORDER: AnimId[] = ['hurt', 'jab', 'cross', 'finisher', 'fall', 'down', 'getup', 'run'];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Bake queued animations in the background, spending at most ~`budgetMs`
 * per call (always at least one), so first use of a move never hitches.
 */
export const warmSprites = (budgetMs = 2): void => {
  const t0 = now();
  while (pending.length) {
    pending.shift()?.();
    if (now() - t0 >= budgetMs) break;
  }
};
const tintCache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

const buildTable = (
  look: Look
): { right: FrameTable; left: FrameTable; height: number; ready: boolean } => {
  // roomy cell: spiky hair, capes, smears and auras reach past the body
  const size = Math.ceil(80 * look.scale);
  const ax = Math.floor(size / 2);
  const ay = size - Math.ceil(7 * look.scale);
  const right = {} as FrameTable;
  const left = {} as FrameTable;
  let height = 50 * look.scale;
  let ready = false;

  const partial = new Map<AnimId, { r: Frame[]; l: Frame[] }>();
  const bakePose = (id: AnimId, i: number, r: Frame[], l: Frame[]) => {
    const res = bakeFigure(look, ANIMS[id].poses[i], size, ax, ay, i, FLASH_ANIMS.has(id));
    let img: HTMLCanvasElement;
    let hand: [number, number] = [ax + 8, ay - 28];
    if (res) {
      ready = true;
      img = res.canvas;
      hand = res.hand;
      if (id === 'idle' && i === 0) height = ay - res.headTop;
    } else {
      img = createSurface(size, size).canvas;
    }
    const fl = res?.flash ?? undefined;
    r.push({ img, ax, ay, hx: hand[0], hy: hand[1], flash: fl });
    const m = mirrorSurface(img);
    l.push({
      img: m.canvas,
      ax: size - ax,
      ay,
      hx: size - hand[0],
      hy: hand[1],
      flash: fl ? mirrorSurface(fl).canvas : undefined,
    });
  };
  const slot = (id: AnimId) => {
    let p = partial.get(id);
    if (!p) {
      p = { r: [], l: [] };
      partial.set(id, p);
    }
    return p;
  };
  /** Bake the next pose of `id`; returns true once the animation is complete. */
  const step = (id: AnimId): boolean => {
    if (Object.getOwnPropertyDescriptor(right, id)?.value) return true;
    const p = slot(id);
    const n = ANIMS[id].poses.length;
    if (p.r.length < n) bakePose(id, p.r.length, p.r, p.l);
    if (p.r.length < n) return false;
    // replace the lazy getters with plain data
    Object.defineProperty(right, id, { value: p.r, enumerable: true });
    Object.defineProperty(left, id, { value: p.l, enumerable: true });
    partial.delete(id);
    return true;
  };
  const bake = (id: AnimId) => {
    while (!step(id));
    return { r: right[id], l: left[id] };
  };

  (Object.keys(ANIMS) as AnimId[]).forEach((id) => {
    Object.defineProperty(right, id, {
      configurable: true,
      enumerable: true,
      get: () => bake(id).r,
    });
    Object.defineProperty(left, id, {
      configurable: true,
      enumerable: true,
      get: () => bake(id).l,
    });
  });
  // idle sets the reported height; walk is needed the moment anyone spawns
  void right.idle;
  void right.walk;
  const ids = Object.keys(ANIMS) as AnimId[];
  const order = [...WARM_ORDER, ...ids.filter((id) => !WARM_ORDER.includes(id))];
  for (const id of order)
    if (id !== 'idle' && id !== 'walk')
      for (let i = 0; i < ANIMS[id].poses.length; i++) pending.push(() => void step(id));
  return { right, left, height, ready };
};

export const buildPortrait = (look: Look, size = 22): HTMLCanvasElement => bakePortrait(look, size);

export const getSprites = (look: Look): SpriteSet => {
  let set = cache.get(look.key);
  if (set) return set;
  const t = buildTable({ ...look, scale: look.scale * WORLD_SCALE });
  set = {
    look,
    right: t.right,
    left: t.left,
    height: t.height,
    portrait: buildPortrait(look),
    ready: t.ready,
  };
  cache.set(look.key, set);
  return set;
};

/** Solid-colour copy of a frame (white hit flash, red telegraph...). Cached. */
export const tinted = (img: HTMLCanvasElement, color: string): HTMLCanvasElement => {
  let m = tintCache.get(img);
  if (!m) {
    m = new Map();
    tintCache.set(img, m);
  }
  let t = m.get(color);
  if (!t) {
    t = tintSurface(img, color).canvas;
    m.set(color, t);
  }
  return t;
};
