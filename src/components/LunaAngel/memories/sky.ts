import { Photo, photosBy } from '../../../data/photos';
import { seeded } from '../../Landing/travel/journey';

export { clamp, easeOut, glideAt, makeGlide, settle, smooth } from '../../Landing/travel/journey';
export type { Glide } from '../../Landing/travel/journey';

// Running order: starts bright and goofy, settles into naps, ends in evening light
const ORDER = [
  'luna-sunset-trot',
  'luna-car-copilot',
  'luna-good-girl',
  'luna-play-bow',
  'luna-snow-glance',
  'luna-leaf-pile',
  'luna-porch-smile',
  'luna-yellow-raincoat',
  'luna-field-sprint',
  'luna-window-watch',
  'luna-sleepy-face',
  'luna-snow-stop',
  'luna-balloon-field',
  'luna-golden-run',
  'luna-golden-wall',
];

/** Her photos in the order they drift past; falls back to the first dozen if ids change */
export const getMemories = (): Photo[] => {
  const all = photosBy('luna');
  const byId = new Map(all.map((photo) => [photo.id, photo]));
  const picked = ORDER.map((id) => byId.get(id)).filter((photo): photo is Photo => !!photo);
  return picked.length >= 6 ? picked : all.slice(0, 12);
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2023-04' to 'Apr 2023' */
export const formatDate = (date?: string) => {
  if (!date) return '';
  const [year, month] = date.split('-');
  const name = MONTHS[Number(month) - 1];
  return name ? `${name} ${year}` : year;
};

/** Frame ratio for a polaroid: keep tall clips from turning into towers */
export const frameRatio = (photo: Photo) => Math.max(photo.width / photo.height, 0.75);

/**
 * Where each card floats in the sky. x is a sideways offset in focal widths, y a small
 * nudge off centre at the moment the card is in focus, r its tilt. Cycled.
 */
export const DRIFT = [
  { x: -0.9, y: 0.02, r: -4 },
  { x: 0.85, y: -0.06, r: 3 },
  { x: -0.25, y: 0.08, r: -1.5 },
  { x: 1.05, y: 0.04, r: 4.5 },
  { x: -1.05, y: -0.05, r: 2 },
  { x: 0.35, y: 0.06, r: -3 },
];

export type Dot = { x: number; y: number; s: number; o: number; t: number };

export const makeDots = (seed: number, count: number): Dot[] => {
  const rand = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: rand() * 100,
    y: rand(),
    s: rand(),
    o: rand(),
    t: rand(),
  }));
};

// Her constellation: sitting in profile, nose to the left, one big ear up, tail out.
// Points live in a 100 x 100 box.
export const STARS: ReadonlyArray<readonly [number, number]> = [
  [9, 31], // 0 nose
  [19, 26], // 1 muzzle
  [27, 19], // 2 stop
  [35, 14], // 3 crown
  [53, 9], // 4 ear tip, flying back
  [45, 22], // 5 ear base
  [50, 28], // 6 nape
  [58, 42], // 7 withers
  [68, 58], // 8 back
  [78, 72], // 9 rump
  [89, 72], // 10 tail
  [96, 59], // 11 tail tip
  [85, 86], // 12 haunch
  [83, 95], // 13 back foot
  [73, 95], // 14 back toes
  [33, 95], // 15 front toes
  [42, 95], // 16 front paw
  [41, 68], // 17 elbow
  [33, 54], // 18 chest
  [30, 40], // 19 throat
  [18, 35], // 20 jaw
];

/** The eye: not joined to anything, just the brightest one */
export const EYE: readonly [number, number] = [25, 26];

/** Drawing order: round the head, down the back and tail, then the chest and front legs */
export const LINKS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 10],
  [10, 11],
  [9, 12],
  [12, 13],
  [13, 14],
  [0, 20],
  [20, 19],
  [19, 18],
  [18, 17],
  [17, 16],
  [16, 15],
];

/** Segment geometry in box percentages, for rotated hairline divs */
export const SEGMENTS = LINKS.map(([a, b]) => {
  const [x1, y1] = STARS[a];
  const [x2, y2] = STARS[b];
  return {
    x: x1,
    y: y1,
    len: Math.hypot(x2 - x1, y2 - y1),
    angle: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI,
  };
});

/** The order a star first lights up: when the first line touching it starts */
export const STAR_ORDER = STARS.map((_, i) => {
  const first = LINKS.findIndex(([a, b]) => a === i || b === i);
  return first < 0 ? LINKS.length : first;
});

export const PAW_COUNT = 14;

/** Grass along a low rise, closed at the bottom, plus a few seed heads on tall stems */
const f = (n: number) => Math.round(n * 10) / 10;

export const makeMeadow = (seed: number, w: number, h: number, base: number, heads: number) => {
  const rand = seeded(seed);
  const hill = (x: number) =>
    base - 22 * Math.sin((x / w) * Math.PI * 1.4 + 0.6) - 9 * Math.sin((x / w) * Math.PI * 4.2);
  let d = `M0 ${h} L0 ${f(hill(0))}`;
  for (let x = 0; x < w; ) {
    const step = 5 + rand() * 9;
    const y = hill(x);
    const tall = rand() < 0.08 ? 2.2 : 1;
    const bladeH = (10 + rand() * 24) * tall;
    const lean = (rand() - 0.4) * 12 * tall;
    d += ` L${f(x + step * 0.4 + lean)} ${f(y - bladeH)} L${f(x + step)} ${f(hill(x + step))}`;
    x += step;
  }
  const stems = Array.from({ length: heads }, () => {
    const x = 40 + rand() * (w - 80);
    const top = hill(x) - 60 - rand() * 50;
    const bend = (rand() - 0.5) * 18;
    return { x: f(x), y: f(hill(x) + 4), top: f(top), bend: f(bend), r: f(2.4 + rand() * 2.4) };
  });
  return { path: `${d} L${w} ${h} Z`, stems };
};
